//! Allocation-free CFR+ traversal for immutable two-player zero-sum game trees.
//! Fixed-tree kernel. Chance sampling, blocker-aware ranges and NashConv
//! remain the responsibility of the outer postflop solver.
const MAX_ACTIONS: usize = 5;
const MAX_DEPTH: usize = 128;

struct Node { actor:i8, info:usize, first:usize, count:usize, utility:f64 }
struct Info {
    actor:i8, count:usize,
    regrets:[f64;MAX_ACTIONS],
    sum:[f64;MAX_ACTIONS],
}
impl Info {
    fn new(actor:i8,count:usize)->Self {
        Self{actor,count,regrets:[0.;MAX_ACTIONS],sum:[0.;MAX_ACTIONS]}
    }
}
struct Tree { nodes:Vec<Node>, edges:Vec<u32>, infos:Vec<Info> }
impl Tree {
    fn check_cycles(&self,idx:usize,colors:&mut [u8],depth:usize)->Result<(),&'static str>{
        if depth>MAX_DEPTH {return Err("CFR tree too deep");}
        if colors[idx]==1 {return Err("Cyclic CFR tree");}
        if colors[idx]==2 {return Ok(());}
        colors[idx]=1;
        let node=&self.nodes[idx];
        if node.actor>=0 {
            for &child in &self.edges[node.first..node.first+node.count] {
                self.check_cycles(child as usize,colors,depth+1)?;
            }
        }
        colors[idx]=2;
        Ok(())
    }
    fn walk(&mut self,idx:usize,traverser:usize,reach:&mut [f64;2],weight:f64)->f64 {
        let node=&self.nodes[idx];
        let (actor,info_id,start,count,utility)=
            (node.actor,node.info,node.first,node.count,node.utility);
        if actor==-1 {return utility;}
        let actor=actor as usize;
        let mut p=[0f64;MAX_ACTIONS];
        let mut total=0.;
        for (i,item) in p[..count].iter_mut().enumerate(){
            *item=self.infos[info_id].regrets[i].max(0.);
            total+=*item;
        }
        if total>0. {
            for item in &mut p[..count] {*item/=total;}
        } else {p[..count].fill(1./count as f64);}
        let own=reach[actor];
        if traverser==0 {
            for i in 0..count {
                self.infos[info_id].sum[i]+=weight*own*p[i];
            }
        }
        let mut values=[0f64;MAX_ACTIONS];
        let mut ev=0.;
        for i in 0..count {
            reach[actor]=own*p[i];
            let child=self.edges[start+i] as usize;
            values[i]=self.walk(child,traverser,reach,weight);
            reach[actor]=own;
            ev+=p[i]*values[i];
        }
        if actor==traverser {
            let opponent_reach=reach[1-actor];
            let sign=if actor==0 {1.} else {-1.};
            for i in 0..count {
                let change=sign*opponent_reach*(values[i]-ev);
                let old=self.infos[info_id].regrets[i];
                self.infos[info_id].regrets[i]=(old+change).max(0.);
            }
        }
        ev
    }
    fn averages(&self)->Vec<f64> {
        let mut result=Vec::new();
        for info in &self.infos {
            let total:f64=info.sum[..info.count].iter().sum();
            for i in 0..info.count {
                result.push(if total>0. {info.sum[i]/total}
                    else {1./info.count as f64});
            }
        }
        result
    }
}

/// The root is node zero. Actor -1 denotes a terminal payoff (player zero
/// perspective); actors 0 and 1 are decisions. Information set IDs for
/// decisions must be contiguous 0..n-1 with consistent action counts.
/// Output probabilities are concatenated in increasing information set order.
pub fn solve_tree(
    actors:&[i8],info_ids:&[u32],offsets:&[u32],counts:&[u8],
    children:&[u32],utilities:&[f64],iterations:u32
)->Result<Vec<f64>,&'static str>{
    let n=actors.len();
    if n==0||iterations==0||iterations>1_000_000||
        info_ids.len()!=n||offsets.len()!=n||counts.len()!=n||
        utilities.len()!=n||utilities.iter().any(|x|!x.is_finite()){
        return Err("Invalid CFR tree shape");
    }
    if actors[0]==-1 {return Err("CFR root must have actions");}
    let mut infos:Vec<Option<Info>>=Vec::new();
    let mut nodes=Vec::with_capacity(n);
    for i in 0..n {
        let actor=actors[i];let first=offsets[i] as usize;
        let count=counts[i] as usize;
        if first.checked_add(count).map_or(true,|end|end>children.len()){
            return Err("Invalid CFR edge offsets");
        }
        if actor==-1 {
            if count!=0 {return Err("CFR terminal has actions");}
        }else if actor==0||actor==1 {
            if count==0||count>MAX_ACTIONS{return Err("Invalid CFR action count");}
            let id=info_ids[i] as usize;
            if id>n {return Err("Invalid CFR information set ID");}
            if infos.len()<=id {infos.resize_with(id+1,||None);}
            match &infos[id] {
                Some(info) if info.count!=count||info.actor!=actor=>
                    return Err("Inconsistent CFR information set"),
                Some(_)=>(),
                None=>infos[id]=Some(Info::new(actor,count)),
            }
        }else{return Err("Invalid CFR actor");}
        nodes.push(Node{actor,info:info_ids[i] as usize,
            first,count,utility:utilities[i]});
    }
    if infos.is_empty()||infos.iter().any(Option::is_none){
        return Err("CFR information set IDs must be contiguous");
    }
    for &index in children {
        if index as usize>=n {return Err("CFR child out of bounds");}
    }
    let mut game=Tree{nodes,edges:children.to_vec(),
        infos:infos.into_iter().map(|x|x.expect("validated infoset")).collect()};
    let mut colors=vec![0u8;n];
    game.check_cycles(0,&mut colors,0)?;
    for iteration in 1..=iterations {
        let average_weight=iteration as f64;
        for traverser in 0..2 {
            let mut reach=[1.,1.];
            game.walk(0,traverser,&mut reach,average_weight);
        }
    }
    let values=game.averages();
    if values.iter().any(|x|!x.is_finite()) {return Err("Non-finite CFR result");}
    Ok(values)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matching_pennies_with_hidden_second_choice(){
        let actors=[0,1,1,-1,-1,-1,-1];
        let infos=[0,1,1,0,0,0,0];let offsets=[0,2,4,6,6,6,6];
        let counts=[2,2,2,0,0,0,0];let children=[1,2,3,4,5,6];
        let util=[0.,0.,0.,1.,-1.,-1.,1.];
        let p=solve_tree(&actors,&infos,&offsets,&counts,&children,&util,20000).unwrap();
        assert_eq!(p.len(),4);
        for value in p {assert!((value-0.5).abs()<0.03,"{value}");}
    }
    #[test]
    fn terminal_payoff_signs(){
        let p=solve_tree(&[0,-1,-1],&[0,0,0],&[0,2,2],
            &[2,0,0],&[1,2],&[0.,-2.,3.],200).unwrap();
        assert!(p[1]>0.99 && p[0]<0.01);
    }
    #[test]
    fn invalid_trees_rejected(){
        assert!(solve_tree(&[0,-1],&[0,0],&[0,1],&[1,0],
            &[0],&[0.,1.],5).is_err());
        assert!(solve_tree(&[0,1,-1],&[0,0,0],&[0,2,3],
            &[2,1,0],&[1,2,2],&[0.,0.,1.],5).is_err());
        assert!(solve_tree(&[0,-1],&[0,0],&[0,1],&[6,0],
            &[1],&[0.,1.],5).is_err());
    }
}
