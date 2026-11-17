//! General-sum compatible, zero-sum-at-the-table sampled CFR+ for 2–6
//! players. This is a separate engine from the mature two-player CfrSession.
//! Each terminal contains one net-chip utility for EVERY seat; folded seats
//! retain their negative contributions. Strategies and regrets persist across
//! chance samples with immutable information-set IDs.
//!
//! This is a bounded *abstract game* solver, not a full-game GTO oracle.
//! With 3+ actors, CFR+ has no general two-player zero-sum equilibrium guarantee.
use wasm_bindgen::prelude::*;

const MAX_PLAYERS:usize=6;
const MAX_ACTIONS:usize=4;
const MAX_NODES:usize=25_000;
const MAX_DEPTH:usize=96;
const MAX_INFO_SETS:usize=1_000_000;
const MAX_STEPS:u32=1_000_000;

#[derive(Clone,Copy)]
struct Node {actor:i8,info:usize,start:usize,count:usize}
#[derive(Clone)]
struct Info {
    actor:i8,count:usize,regret:[f64;MAX_ACTIONS],sum:[f64;MAX_ACTIONS]
}
impl Info {
    fn new(actor:i8,count:usize)->Self{
        Self{actor,count,regret:[0.;MAX_ACTIONS],sum:[0.;MAX_ACTIONS]}
    }
}
fn walk_validate(
    nodes:&[Node],edges:&[u32],index:usize,depth:usize,marks:&mut[u8]
)->Result<(),&'static str>{
    if depth>MAX_DEPTH{return Err("Multiway game-tree depth budget exceeded");}
    if marks[index]!=0{return Err("Multiway tree must have unique child paths");}
    marks[index]=1;
    let node=nodes[index];
    if node.actor>=0 {
        for edge in &edges[node.start..node.start+node.count] {
            walk_validate(nodes,edges,*edge as usize,depth+1,marks)?;
        }
    }
    marks[index]=2;
    Ok(())
}
fn average(info:&Info)->[f64;MAX_ACTIONS]{
    let mut result=[0.;MAX_ACTIONS];
    let total=info.sum[..info.count].iter().sum::<f64>();
    for (i,item) in result[..info.count].iter_mut().enumerate(){
        *item=if total>0. {info.sum[i]/total}else{1./info.count as f64};
    }
    result
}
fn regret_strategy(info:&Info)->[f64;MAX_ACTIONS]{
    let mut strategy=[0.;MAX_ACTIONS];
    let mut total=0.;
    for (i,item) in strategy[..info.count].iter_mut().enumerate(){
        *item=info.regret[i].max(0.);
        total+=*item;
    }
    if total>0. {
        for item in &mut strategy[..info.count]{*item/=total;}
    }else{
        strategy[..info.count].fill(1./info.count as f64);
    }
    strategy
}
fn traverse(
    nodes:&[Node],edges:&[u32],payoffs:&[f64],player_count:usize,
    infos:&mut[Info],index:usize,traverser:usize,
    reach:&mut[f64;MAX_PLAYERS],weight:f64,average_weight:f64
)->f64{
    let node=nodes[index];
    if node.actor<0 {
        return payoffs[index*player_count+traverser];
    }
    let actor=node.actor as usize;
    let strategy=regret_strategy(&infos[node.info]);
    let own=reach[actor];
    if traverser==0 {
        for a in 0..node.count{
            infos[node.info].sum[a]+=average_weight*own*strategy[a]*weight;
        }
    }
    let mut action_values=[0.;MAX_ACTIONS];
    let mut expected=0.;
    for a in 0..node.count {
        reach[actor]=own*strategy[a];
        action_values[a]=traverse(nodes,edges,payoffs,player_count,infos,
            edges[node.start+a] as usize,traverser,reach,weight,average_weight);
        reach[actor]=own;
        expected+=strategy[a]*action_values[a];
    }
    if actor==traverser {
        let opponents_reach=reach[..player_count].iter()
            .enumerate().filter(|(player,_)|*player!=actor)
            .map(|(_,value)|*value).product::<f64>();
        for a in 0..node.count {
            let old=infos[node.info].regret[a];
            infos[node.info].regret[a]=(old+
                weight*opponents_reach*(action_values[a]-expected)).max(0.);
        }
    }
    expected
}

#[wasm_bindgen]
pub struct MultiwayCfrSession {
    players:usize,
    infos:Vec<Info>,
    steps:u32
}
#[wasm_bindgen]
impl MultiwayCfrSession {
    #[wasm_bindgen(constructor)]
    pub fn new(players:u8)->Result<MultiwayCfrSession,JsValue>{
        Self::new_internal(players).map_err(JsValue::from_str)
    }
    pub fn step(
        &mut self,actors:&[i8],ids:&[u32],offsets:&[u32],counts:&[u8],
        children:&[u32],payoffs:&[f64],chance_weight:f64
    )->Result<u32,JsValue>{
        self.step_internal(actors,ids,offsets,counts,children,payoffs,chance_weight)
            .map_err(JsValue::from_str)
    }
    pub fn average_strategy(&self)->Vec<f64>{
        let mut result=Vec::new();
        for info in &self.infos{result.extend_from_slice(&average(info)[..info.count]);}
        result
    }
    pub fn strategy_for_info_set(&self,id:u32)->Result<Vec<f64>,JsValue>{
        self.strategy_internal(id).map_err(JsValue::from_str)
    }
    pub fn iterations(&self)->u32{self.steps}
    pub fn information_set_count(&self)->usize{self.infos.len()}
    pub fn player_count(&self)->usize{self.players}
}
impl MultiwayCfrSession {
    fn new_internal(players:u8)->Result<Self,&'static str>{
        if !(2..=MAX_PLAYERS as u8).contains(&players){
            return Err("Multiway CFR+ requires 2–6 players");
        }
        Ok(Self{players:players as usize,infos:Vec::new(),steps:0})
    }
    fn strategy_internal(&self,id:u32)->Result<Vec<f64>,&'static str>{
        let info=self.infos.get(id as usize).ok_or("Unknown multiway information set")?;
        Ok(average(info)[..info.count].to_vec())
    }
    fn step_internal(
        &mut self,actors:&[i8],ids:&[u32],offsets:&[u32],counts:&[u8],
        children:&[u32],payoffs:&[f64],chance_weight:f64
    )->Result<u32,&'static str>{
        let n=actors.len();
        if self.steps>=MAX_STEPS||n<2||n>MAX_NODES||
           ids.len()!=n||offsets.len()!=n||counts.len()!=n||
           payoffs.len()!=n*self.players||
           !chance_weight.is_finite()||chance_weight<0. {
            return Err("Invalid multiway CFR+ sample dimensions or weight");
        }
        let mut nodes=Vec::with_capacity(n);
        let known=self.infos.len();
        let mut additional=Vec::<(i8,usize)>::new();
        for i in 0..n{
            let actor=actors[i];
            let count=counts[i] as usize;
            let start=offsets[i] as usize;
            if start>children.len()||count>children.len()-start{
                return Err("Multiway CFR+ child offsets out of range");
            }
            if actor==-1{
                if count!=0{return Err("Terminal multiway node has children");}
                let row=&payoffs[i*self.players..(i+1)*self.players];
                if row.iter().any(|v|!v.is_finite()){
                    return Err("Non-finite terminal multiway utility");
                }
                let sum: f64=row.iter().sum();
                let scale:f64=row.iter().map(|v|v.abs()).sum();
                if sum.abs()>1e-7*(1.+scale){
                    return Err("Multiway poker terminal payoffs must sum to zero");
                }
            }else if actor<0||actor as usize>=self.players||
                     count<1||count>MAX_ACTIONS{
                return Err("Invalid multiway decision actor or action count");
            }else{
                let id=ids[i] as usize;
                if id<known{
                    let info=&self.infos[id];
                    if info.actor!=actor||info.count!=count{
                        return Err("Inconsistent multiway information set");
                    }
                }else{
                    if id>=MAX_INFO_SETS{return Err("Multiway information set capacity exceeded");}
                    let offset=id-known;
                    if offset>additional.len(){
                        return Err("Multiway information set IDs contain gaps");
                    }
                    if offset==additional.len(){additional.push((actor,count));}
                    else if additional[offset]!=(actor,count){
                        return Err("Inconsistent new multiway information set");
                    }
                }
            }
            nodes.push(Node{actor,info:ids[i] as usize,start,count});
        }
        if nodes[0].actor<0{return Err("Multiway root is terminal");}
        if children.iter().any(|id|*id as usize>=n){
            return Err("Multiway child index out of bounds");
        }
        if known+additional.len()>MAX_INFO_SETS{
            return Err("Multiway information set capacity exceeded");
        }
        // Ensure no hidden disconnected decisions, aliases, DAGs, or cycles.
        let mut indegrees=vec![0u8;n];
        for node in &nodes{
            if node.actor<0{continue;}
            for &child in &children[node.start..node.start+node.count]{
                let count=&mut indegrees[child as usize];
                *count=count.saturating_add(1);
                if *count>1{return Err("Multiway tree shares a child across branches");}
            }
        }
        if indegrees[0]!=0||indegrees[1..].iter().any(|count|*count!=1){
            return Err("Multiway tree is disconnected or cyclic");
        }
        let mut marks=vec![0u8;n];
        walk_validate(&nodes,children,0,0,&mut marks)?;
        if marks.iter().any(|v|*v!=2){
            return Err("Multiway game tree is not fully reachable");
        }
        // Only after complete validation do we allocate persistent infos.
        for (actor,count) in additional{self.infos.push(Info::new(actor,count));}
        let mut reach=[1.;MAX_PLAYERS];
        // One chance sample trains every seat's counterfactual regret.
        // This differs from HU's sign inversion: utilities are seat-specific.
        for traverser in 0..self.players{
            reach.fill(1.);
            traverse(&nodes,children,payoffs,self.players,&mut self.infos,
                0,traverser,&mut reach,chance_weight,(self.steps+1) as f64);
        }
        self.steps+=1;
        Ok(self.steps)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // Three-player sequential game: P0 chooses left/right. P1 and P2 each
    // own one decision under disjoint branches; terminal utilities sum to 0.
    fn fixture()->(Vec<i8>,Vec<u32>,Vec<u32>,Vec<u8>,Vec<u32>,Vec<f64>){
        (
            vec![0,1,-1,-1,2,-1,-1],
            vec![0,1,0,0,2,0,0],
            vec![0,2,4,4,4,6,6],
            vec![2,2,0,0,2,0,0],
            vec![1,4,2,3,5,6],
            vec![
              0.,0.,0., 0.,0.,0.,
              1.,-1.,0., -1.,1.,0.,
              0.,0.,0.,
              1.,0.,-1., -1.,0.,1.
            ]
        )
    }
    #[test]fn multiway_three_player_zero_sum_outputs_normalized_strategy(){
        let (a,i,o,c,e,p)=fixture();
        let mut session=MultiwayCfrSession::new_internal(3).unwrap();
        for n in 0..300{
            assert_eq!(session.step_internal(&a,&i,&o,&c,&e,&p,if n%2==0{1.}else{0.5}).unwrap(),n+1);
        }
        assert_eq!(session.player_count(),3);
        assert_eq!(session.information_set_count(),3);
        assert_eq!(session.iterations(),300);
        for id in 0..3{
            let probabilities=session.strategy_internal(id).unwrap();
            assert!((probabilities.iter().sum::<f64>()-1.).abs()<1e-12);
            assert!(probabilities.iter().all(|v|v.is_finite()&&*v>=0.&&*v<=1.));
        }
        assert_eq!(session.average_strategy().len(),6);
    }
    #[test]fn invalid_deal_preserves_regrets_and_iteration_counter(){
        let (a,i,o,c,e,p)=fixture();
        let mut session=MultiwayCfrSession::new_internal(3).unwrap();
        session.step_internal(&a,&i,&o,&c,&e,&p,1.).unwrap();
        let before=session.average_strategy();
        let mut invalid=p.clone();
        invalid[6]=f64::NAN;
        assert!(session.step_internal(&a,&i,&o,&c,&e,&invalid,1.).is_err());
        let mut invalid=p.clone();
        invalid[6]+=5.;
        assert!(session.step_internal(&a,&i,&o,&c,&e,&invalid,1.).is_err());
        let mut invalid_ids=i.clone();invalid_ids[4]=99;
        assert!(session.step_internal(&a,&invalid_ids,&o,&c,&e,&p,1.).is_err());
        let mut invalid_actions=c.clone();invalid_actions[0]=0;
        assert!(session.step_internal(&a,&i,&o,&invalid_actions,&e,&p,1.).is_err());
        assert_eq!(session.average_strategy(),before);
        assert_eq!(session.iterations(),1);
        assert_eq!(session.information_set_count(),3);
        assert_eq!(session.step_internal(&a,&i,&o,&c,&e,&p,1.).unwrap(),2);
    }
    #[test]fn six_player_terminal_utilities_remain_zero_sum(){
        let mut session=MultiwayCfrSession::new_internal(6).unwrap();
        let actors=[0,-1,-1];let ids=[0,0,0];
        let offsets=[0,2,2];let counts=[2,0,0];let edges=[1,2];
        let payoffs=[
          0.,0.,0.,0.,0.,0.,
          3.,-1.,-1. ,-0.5 ,-0.5,0.,
          -2.,-1.,-1.,1.,2.,1.
        ];
        assert_eq!(session.step_internal(&actors,&ids,&offsets,&counts,&edges,&payoffs,1.).unwrap(),1);
        assert_eq!(session.average_strategy().len(),2);
        assert!(session.strategy_internal(20).is_err());
    }
    #[test]fn invalid_player_counts_and_aliasing_rejected(){
        for n in [0,1,7,255]{
            assert!(MultiwayCfrSession::new_internal(n).is_err());
        }
        let mut session=MultiwayCfrSession::new_internal(3).unwrap();
        let (a,i,o,c,_,p)=fixture();
        let children=[1,1,2,3,5,6];
        assert!(session.step_internal(&a,&i,&o,&c,&children,&p,1.).is_err());
        assert_eq!(session.iterations(),0);
    }
}
