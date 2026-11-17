//! Stateful sampled CFR+ with persistent information sets across changing deals.
//! The caller supplies a flattened action tree per sample and stable, global
//! information-set IDs; regrets stay in Rust memory across all chance samples.
use wasm_bindgen::prelude::*;

const MAX_ACTIONS:usize=5;
const MAX_DEPTH:usize=128;
const MAX_NODES:usize=250_000;

#[derive(Clone,Copy)]
struct Node {actor:i8,info:usize,start:usize,len:usize,payoff:f64}
struct Info {actor:i8,len:usize,regret:[f64;MAX_ACTIONS],sum:[f64;MAX_ACTIONS]}
impl Info {
    fn new(actor:i8,len:usize)->Self{
        Self{actor,len,regret:[0.;MAX_ACTIONS],sum:[0.;MAX_ACTIONS]}
    }
}
fn check(nodes:&[Node],edges:&[u32],index:usize,depth:usize,marks:&mut[u8])
    ->Result<(),&'static str>{
    if depth>MAX_DEPTH {return Err("Maximum CFR+ recursion depth exceeded");}
    if marks[index]==1 {return Err("Cycle in CFR+ game tree");}
    if marks[index]==2 {return Ok(());}
    marks[index]=1;
    let node=nodes[index];
    if node.actor>=0 {
        for &child in &edges[node.start..node.start+node.len] {
            check(nodes,edges,child as usize,depth+1,marks)?;
        }
    }
    marks[index]=2;
    Ok(())
}
fn traverse(
    nodes:&[Node],edges:&[u32],infos:&mut[Info],index:usize,
    traverser:usize,reach:&mut[f64;2],average_weight:f64,chance_weight:f64
)->f64 {
    let node=nodes[index];
    if node.actor==-1 {return node.payoff;}
    let actor=node.actor as usize;
    let mut strategy=[0f64;MAX_ACTIONS];
    let mut total=0.;
    for i in 0..node.len {
        let positive=infos[node.info].regret[i].max(0.);
        strategy[i]=positive;
        total+=positive;
    }
    if total>0. {
        for item in &mut strategy[..node.len] {*item/=total;}
    } else {strategy[..node.len].fill(1./node.len as f64);}
    let own=reach[actor];
    if traverser==0 {
        for i in 0..node.len {
            infos[node.info].sum[i]+=average_weight*own*strategy[i]*chance_weight;
        }
    }
    let mut action_values=[0f64;MAX_ACTIONS];
    let mut expected=0f64;
    for i in 0..node.len {
        reach[actor]=own*strategy[i];
        action_values[i]=traverse(nodes,edges,infos,edges[node.start+i] as usize,
            traverser,reach,average_weight,chance_weight);
        reach[actor]=own;
        expected+=strategy[i]*action_values[i];
    }
    if actor==traverser {
        let sign=if actor==0 {1.} else {-1.};
        let opposite=reach[1-actor];
        for i in 0..node.len {
            let change=sign*opposite*(action_values[i]-expected)*chance_weight;
            let previous=infos[node.info].regret[i];
            infos[node.info].regret[i]=(previous+change).max(0.);
        }
    }
    expected
}

/// A persistent regret table trained with one sampled decision tree per step.
/// The caller must maintain globally stable information-set IDs and action
/// signatures between steps. The current V1 solver owns these semantics.
#[wasm_bindgen]
pub struct CfrSession {
    infos:Vec<Info>,steps:u32,
    // Only working buffers: reset on every sample; V1-equivalent persistent
    // regrets/strategy sums are kept in infos.
    nodes:Vec<Node>,
    pending:Vec<(i8,usize)>,
    marks:Vec<u8>
}
#[wasm_bindgen]
impl CfrSession {
    #[wasm_bindgen(constructor)]
    pub fn new()->CfrSession{CfrSession{
        infos:Vec::new(),steps:0,
        nodes:Vec::new(),pending:Vec::new(),marks:Vec::new()
    }}

    pub fn step(
        &mut self,actors:&[i8],ids:&[u32],offsets:&[u32],counts:&[u8],
        children:&[u32],payoffs:&[f64],chance_weight:f64
    )->Result<u32,JsValue>{
        self.step_internal(actors,ids,offsets,counts,children,payoffs,chance_weight)
            .map_err(JsValue::from_str)
    }
    pub fn average_strategy(&self)->Vec<f64>{
        let mut result=Vec::new();
        for info in &self.infos {
            let total:f64=info.sum[..info.len].iter().sum();
            for i in 0..info.len {
                result.push(if total>0. {info.sum[i]/total} else {1./info.len as f64});
            }
        }
        result
    }
    pub fn iterations(&self)->u32{self.steps}
    pub fn information_set_count(&self)->usize{self.infos.len()}
}
impl Default for CfrSession {fn default()->Self{Self::new()}}
impl CfrSession {
    pub(crate) fn step_internal(
        &mut self,actors:&[i8],ids:&[u32],offsets:&[u32],counts:&[u8],
        edges:&[u32],payoffs:&[f64],chance_weight:f64
    )->Result<u32,&'static str>{
        let n=actors.len();
        if n==0||n>MAX_NODES||self.steps>=1_000_000||
            ids.len()!=n||offsets.len()!=n||counts.len()!=n||
            payoffs.len()!=n||payoffs.iter().any(|x|!x.is_finite())||
            !chance_weight.is_finite()||chance_weight<0.{
            return Err("Invalid CFR+ sample");
        }
        if actors[0]==-1 {return Err("CFR+ root cannot be terminal");}
        // Reuse allocations across sequential chance samples. The old
        // implementation allocated nodes, marks and pending IDs on *every*
        // iteration, even for identical public betting trees.
        self.nodes.clear();
        self.nodes.reserve(n.saturating_sub(self.nodes.capacity()));
        self.pending.clear();
        for i in 0..n {
            let actor=actors[i];
            let start=offsets[i] as usize;
            let count=counts[i] as usize;
            if start.checked_add(count).map_or(true,|end|end>edges.len()){
                return Err("CFR+ edge offset out of bounds");
            }
            if actor==-1 {
                if count!=0 {return Err("CFR+ terminal cannot have children");}
            }else if actor==0||actor==1 {
                if count==0||count>MAX_ACTIONS {return Err("Invalid CFR+ action count");}
                let id=ids[i] as usize;
                if id<self.infos.len(){
                    let info=&self.infos[id];
                    if info.actor!=actor||info.len!=count{
                        return Err("Inconsistent persistent information set");
                    }
                }else{
                    let new_id=id-self.infos.len();
                    if new_id>self.pending.len(){return Err("CFR+ information set IDs contain gaps");}
                    if new_id==self.pending.len(){self.pending.push((actor,count));}
                    else if self.pending[new_id]!=(actor,count){
                        return Err("Inconsistent new information set");
                    }
                }
            }else {return Err("Invalid CFR+ actor");}
            self.nodes.push(Node{actor,info:ids[i] as usize,start,len:count,payoff:payoffs[i]});
        }
        for &child in edges {
            if child as usize>=n {return Err("CFR+ child index out of bounds");}
        }
        self.marks.resize(n,0);
        self.marks.fill(0);
        check(&self.nodes,edges,0,0,&mut self.marks)?;
        for &(actor,len) in &self.pending {self.infos.push(Info::new(actor,len));}
        let average_weight=self.steps as f64+1.;
        for player in 0..2 {
            let mut reach=[1.,1.];
            traverse(&self.nodes,edges,&mut self.infos,0,player,
                &mut reach,average_weight,chance_weight);
        }
        self.steps+=1;
        Ok(self.steps)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample(s:&mut CfrSession,u:[f64;4],weight:f64){
        let actors=[0,1,1,-1,-1,-1,-1];
        let info=[0,1,1,0,0,0,0];
        let offsets=[0,2,4,6,6,6,6];
        let counts=[2,2,2,0,0,0,0];
        let edges=[1,2,3,4,5,6];
        let payoffs=[0.,0.,0.,u[0],u[1],u[2],u[3]];
        s.step_internal(&actors,&info,&offsets,&counts,&edges,&payoffs,weight).unwrap();
    }
    #[test]
    fn matching_pennies_with_shared_hidden_infosets(){
        let mut session=CfrSession::new();
        for _ in 0..20_000 {sample(&mut session,[1.,-1.,-1.,1.],1.);}
        let probabilities=session.average_strategy();
        assert_eq!(session.iterations(),20_000);
        assert_eq!(session.information_set_count(),2);
        for p in probabilities {assert!((p-0.5).abs()<0.03);}
    }
    #[test]
    fn samples_with_different_showdowns_share_regrets(){
        let mut session=CfrSession::new();
        for i in 0..1000 {
            if i%2==0 {sample(&mut session,[1.,-1.,-1.,1.],2.);}
            else {sample(&mut session,[-1.,1.,1.,-1.],1.);}
        }
        assert_eq!(session.iterations(),1000);
        assert!(session.average_strategy().iter().all(|p|p.is_finite()&&(0.0..=1.0).contains(p)));
    }
    #[test]
    fn invalid_sample_does_not_change_state(){
        let mut session=CfrSession::new();
        sample(&mut session,[1.,-1.,-1.,1.],1.);
        let before=session.average_strategy();
        assert!(session.step_internal(&[0,-1],&[0,0],&[0,1],&[1,0],
            &[0],&[0.,1.],1.).is_err());
        assert_eq!(session.iterations(),1);
        assert_eq!(session.average_strategy(),before);
    }
    #[test]
    fn sample_buffers_reused_and_recovered_after_invalid_tree(){
        let mut session=CfrSession::new();
        sample(&mut session,[1.,-1.,-1.,1.],1.);
        let node_capacity=session.nodes.capacity();
        let marks_capacity=session.marks.capacity();
        let pending_capacity=session.pending.capacity();
        for index in 0..200 {
            let values=if index%2==0 {[1.,-1.,-1.,1.]} else {[-1.,1.,1.,-1.]};
            sample(&mut session,values,1.);
            assert_eq!(session.nodes.capacity(),node_capacity);
            assert_eq!(session.marks.capacity(),marks_capacity);
            assert_eq!(session.pending.capacity(),pending_capacity);
        }
        let before=session.average_strategy();
        assert!(session.step_internal(&[0,-1],&[0,0],&[0,1],&[1,0],
            &[0],&[0.,1.],1.).is_err());
        assert_eq!(session.average_strategy(),before);
        sample(&mut session,[1.,-1.,-1.,1.],1.);
        assert_eq!(session.iterations(),202);
    }
    #[test]
    fn actor_and_action_count_must_match_prior_information_set(){
        let mut session=CfrSession::new();
        sample(&mut session,[1.,-1.,-1.,1.],1.);
        assert!(session.step_internal(&[1,-1,-1],&[0,0,0],&[0,2,2],
            &[2,0,0],&[1,2],&[0.,1.,-1.],1.).is_err());
    }
}
