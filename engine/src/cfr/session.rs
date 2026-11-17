//! Stateful sampled CFR+ with persistent information sets across changing deals.
//! The caller supplies a flattened action tree per sample and stable, global
//! information-set IDs; regrets stay in Rust memory across all chance samples.
use wasm_bindgen::prelude::*;

const MAX_ACTIONS:usize=5;
const MAX_DEPTH:usize=128;
const MAX_NODES:usize=250_000;
// Bound session-owned topologies so caching cannot exhaust mobile WASM memory.
const MAX_PREPARED_TREES:usize=2048;
const MAX_PREPARED_NODES:usize=1_000_000;
// Bound serialized batch payload (<2 MiB per group), independent of tree size.
const MAX_PREPARED_BATCH:usize=16;
const MAX_BATCH_ELEMENTS:usize=174_762; // 174762 * (4+8) bytes < 2 MiB

#[derive(Clone,Copy)]
struct Node {actor:i8,info:usize,start:usize,len:usize,payoff:f64}
struct PreparedTopology {nodes:Vec<Node>,edges:Vec<u32>,payouts:Option<Vec<[f64;3]>>}
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

/// Preflight all info-set allocations for a batch without mutating the
/// session. IDs must be contiguous in first-encounter DFS order.
fn validate_prepared_batch_infos(
    infos:&[Info],nodes:&[Node],ids:&[u32],batch:usize
)->Result<Vec<(i8,usize)>,&'static str>{
    let n=nodes.len();
    let known=infos.len();
    let mut created:Vec<(i8,usize)>=Vec::new();
    for sample in 0..batch {
        let offset=sample*n;
        for (index,node) in nodes.iter().enumerate(){
            if node.actor<0 {continue;}
            let id=ids[offset+index] as usize;
            let expected=(node.actor,node.len);
            if id<known {
                let info=&infos[id];
                if (info.actor,info.len)!=expected {
                    return Err("Inconsistent persistent information set");
                }
            }else {
                let next=id-known;
                if next>created.len(){return Err("CFR+ information set IDs contain gaps");}
                if next==created.len(){created.push(expected);}
                else if created[next]!=expected {
                    return Err("Inconsistent new information set");
                }
            }
        }
    }
    Ok(created)
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
    marks:Vec<u8>,
    prepared:Vec<PreparedTopology>,
    prepared_nodes:usize
}
#[wasm_bindgen]
impl CfrSession {
    #[wasm_bindgen(constructor)]
    pub fn new()->CfrSession{CfrSession{
        infos:Vec::new(),steps:0,
        nodes:Vec::new(),pending:Vec::new(),marks:Vec::new(),
        prepared:Vec::new(),prepared_nodes:0
    }}

    pub fn step(
        &mut self,actors:&[i8],ids:&[u32],offsets:&[u32],counts:&[u8],
        children:&[u32],payoffs:&[f64],chance_weight:f64
    )->Result<u32,JsValue>{
        self.step_internal(actors,ids,offsets,counts,children,payoffs,chance_weight)
            .map_err(JsValue::from_str)
    }
    /// Validate and store the immutable public tree once. Information-set IDs
    /// and terminal payoffs remain per-sample data, supplied to step_prepared.
    pub fn prepare_tree(
        &mut self,actors:&[i8],offsets:&[u32],counts:&[u8],children:&[u32]
    )->Result<u32,JsValue>{
        self.prepare_tree_internal(actors,offsets,counts,children)
            .map_err(JsValue::from_str)
    }
    /// Run one complete two-player CFR+ update on a previously validated tree.
    pub fn step_prepared(
        &mut self,handle:u32,ids:&[u32],payoffs:&[f64],chance_weight:f64
    )->Result<u32,JsValue>{
        self.step_prepared_internal(handle,ids,payoffs,chance_weight)
            .map_err(JsValue::from_str)
    }
    /// Validate an entire batch before any CFR+ state mutation. Each sample
    /// must use the same prepared public topology; private IDs, payoffs and
    /// importance weights may change between samples.
    pub fn step_prepared_batch(
        &mut self,handle:u32,ids:&[u32],payoffs:&[f64],chance_weights:&[f64]
    )->Result<u32,JsValue>{
        self.step_prepared_batch_internal(handle,ids,payoffs,chance_weights)
            .map_err(JsValue::from_str)
    }
    /// Compile immutable fold and showdown payouts in the Rust topology.
    /// Kind: 0=decision, 1=fold (hero wins), 2=fold (hero loses),
    /// 3=showdown. Payouts are player-0 net chips, not pot shares.
    pub fn prepare_payoffs(
        &mut self,handle:u32,kinds:&[u8],pots:&[f64],invested:&[f64]
    )->Result<(),JsValue>{
        self.prepare_payoffs_internal(handle,kinds,pots,invested)
            .map_err(JsValue::from_str)
    }
    /// Send only sampled private info IDs, showdown results and weights.
    pub fn step_prepared_outcome_batch(
        &mut self,handle:u32,ids:&[u32],outcomes:&[i8],weights:&[f64]
    )->Result<u32,JsValue>{
        self.step_prepared_outcome_batch_internal(handle,ids,outcomes,weights)
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
    pub(crate) fn prepare_payoffs_internal(
        &mut self,handle:u32,kinds:&[u8],pots:&[f64],invested:&[f64]
    )->Result<(),&'static str>{
        let topology=self.prepared.get_mut(handle as usize)
            .ok_or("Unknown prepared CFR+ topology")?;
        let n=topology.nodes.len();
        if kinds.len()!=n||pots.len()!=n||invested.len()!=n||
            pots.iter().any(|v|!v.is_finite())||
            invested.iter().any(|v|!v.is_finite()){
            return Err("Invalid prepared CFR+ payouts");
        }
        let mut model=Vec::with_capacity(n);
        for (index,node) in topology.nodes.iter().enumerate(){
            let pot=pots[index];
            let hero_invested=invested[index];
            let value=if node.actor>=0 {
                if kinds[index]!=0{return Err("Payoff kind on decision node");}
                [0.;3]
            } else {
                match kinds[index] {
                    1 => [pot-hero_invested;3],
                    2 => [-hero_invested;3],
                    3 => [pot-hero_invested,pot/2.-hero_invested,-hero_invested],
                    _ => return Err("Invalid prepared CFR+ terminal type")
                }
            };
            if value.iter().any(|v|!v.is_finite()){
                return Err("Non-finite prepared CFR+ utility");
            }
            model.push(value);
        }
        // Transactional: retain the previous valid model on malformed input.
        topology.payouts=Some(model);
        Ok(())
    }

    pub(crate) fn step_prepared_outcome_batch_internal(
        &mut self,handle:u32,ids:&[u32],outcomes:&[i8],weights:&[f64]
    )->Result<u32,&'static str>{
        let topology=self.prepared.get(handle as usize)
            .ok_or("Unknown prepared CFR+ topology")?;
        if topology.payouts.is_none(){return Err("Unprepared CFR+ terminal payouts");}
        let n=topology.nodes.len();
        let batch=weights.len();
        let elements=n.checked_mul(batch)
            .ok_or("Oversized CFR+ sample batch")?;
        if batch==0||batch>MAX_PREPARED_BATCH||elements>MAX_BATCH_ELEMENTS||
            ids.len()!=elements||outcomes.len()!=batch||
            (self.steps as usize).checked_add(batch).map_or(true,|x|x>1_000_000)||
            outcomes.iter().any(|v|*v!=1&&*v!=0&&*v!=-1)||
            weights.iter().any(|v|!v.is_finite()||*v<0.){
            return Err("Invalid prepared CFR+ outcome batch");
        }
        let new_infos=validate_prepared_batch_infos(&self.infos,&topology.nodes,ids,batch)?;
        for (actor,len) in new_infos {self.infos.push(Info::new(actor,len));}
        let topology=self.prepared.get_mut(handle as usize).unwrap();
        let payouts=topology.payouts.as_ref().unwrap();
        for sample in 0..batch {
            let offset=sample*n;
            let outcome_index=match outcomes[sample]{1=>0,0=>1,_=>2};
            for (index,node) in topology.nodes.iter_mut().enumerate(){
                node.info=ids[offset+index] as usize;
                node.payoff=payouts[index][outcome_index];
            }
            let average_weight=self.steps as f64+1.;
            for traverser in 0..2 {
                let mut reach=[1.,1.];
                traverse(&topology.nodes,&topology.edges,&mut self.infos,0,traverser,
                    &mut reach,average_weight,weights[sample]);
            }
            self.steps+=1;
        }
        Ok(self.steps)
    }

    pub(crate) fn prepare_tree_internal(
        &mut self,actors:&[i8],offsets:&[u32],counts:&[u8],edges:&[u32]
    )->Result<u32,&'static str>{
        let n=actors.len();
        if n==0||n>MAX_NODES||offsets.len()!=n||counts.len()!=n||
            actors[0]==-1||self.prepared.len()>=MAX_PREPARED_TREES||
            self.prepared_nodes.checked_add(n).map_or(true,|size|size>MAX_PREPARED_NODES){
            return Err("Invalid or oversized prepared CFR+ topology");
        }
        let mut nodes=Vec::with_capacity(n);
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
            }else {return Err("Invalid CFR+ actor");}
            nodes.push(Node{actor,info:0,start,len:count,payoff:0.});
        }
        for &child in edges {
            if child as usize>=n {return Err("CFR+ child index out of bounds");}
        }
        let mut marks=vec![0;n];
        check(&nodes,edges,0,0,&mut marks)?;
        let handle=self.prepared.len() as u32;
        self.prepared.push(PreparedTopology{nodes,edges:edges.to_vec(),payouts:None});
        self.prepared_nodes+=n;
        Ok(handle)
    }

    pub(crate) fn step_prepared_internal(
        &mut self,handle:u32,ids:&[u32],payoffs:&[f64],chance_weight:f64
    )->Result<u32,&'static str>{
        let topology=self.prepared.get_mut(handle as usize)
            .ok_or("Unknown prepared CFR+ topology")?;
        let n=topology.nodes.len();
        if self.steps>=1_000_000||ids.len()!=n||payoffs.len()!=n||
            payoffs.iter().any(|x|!x.is_finite())||
            !chance_weight.is_finite()||chance_weight<0. {
            return Err("Invalid prepared CFR+ sample");
        }
        // A rejected sample must never reserve information sets or update regrets.
        self.pending.clear();
        for i in 0..n {
            let actor=topology.nodes[i].actor;
            if actor<0 {continue;}
            let id=ids[i] as usize;
            let count=topology.nodes[i].len;
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
        }
        for i in 0..n {
            topology.nodes[i].info=ids[i] as usize;
            topology.nodes[i].payoff=payoffs[i];
        }
        for &(actor,len) in &self.pending {self.infos.push(Info::new(actor,len));}
        let average_weight=self.steps as f64+1.;
        for player in 0..2 {
            let mut reach=[1.,1.];
            traverse(&topology.nodes,&topology.edges,&mut self.infos,0,player,
                &mut reach,average_weight,chance_weight);
        }
        self.steps+=1;
        Ok(self.steps)
    }

    pub(crate) fn step_prepared_batch_internal(
        &mut self,handle:u32,ids:&[u32],payoffs:&[f64],weights:&[f64]
    )->Result<u32,&'static str>{
        let topology=self.prepared.get(handle as usize)
            .ok_or("Unknown prepared CFR+ topology")?;
        let n=topology.nodes.len();
        let batch=weights.len();
        let elements=n.checked_mul(batch)
            .ok_or("Oversized CFR+ sample batch")?;
        if batch==0||batch>MAX_PREPARED_BATCH||elements>MAX_BATCH_ELEMENTS||
            ids.len()!=elements||payoffs.len()!=elements||
            (self.steps as usize).checked_add(batch).map_or(true,|n|n>1_000_000)||
            weights.iter().any(|w|!w.is_finite()||*w<0.)||
            payoffs.iter().any(|v|!v.is_finite()){
            return Err("Invalid or oversized prepared CFR+ batch");
        }
        // Preflight the global, sequential info-set allocation across ALL
        // samples, not just each sample in isolation. A rejected batch must
        // leave regrets, average strategies and iteration counters unchanged.
        let new_infos=validate_prepared_batch_infos(&self.infos,&topology.nodes,ids,batch)?;
        // Only after successful validation may we allocate information sets
        // and traverse. Their zeroed initial state is independent of whether
        // later samples have already reserved their IDs.
        for (actor,len) in new_infos {self.infos.push(Info::new(actor,len));}
        let topology=self.prepared.get_mut(handle as usize).unwrap();
        for sample in 0..batch {
            let start=sample*n;
            for (index,node) in topology.nodes.iter_mut().enumerate(){
                node.info=ids[start+index] as usize;
                node.payoff=payoffs[start+index];
            }
            let average_weight=self.steps as f64+1.;
            for player in 0..2 {
                let mut reach=[1.,1.];
                traverse(&topology.nodes,&topology.edges,&mut self.infos,0,player,
                    &mut reach,average_weight,weights[sample]);
            }
            self.steps+=1;
        }
        Ok(self.steps)
    }

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
        self.nodes.reserve(n);
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
    fn prepared_topology_matches_legacy_step_with_changing_ids_and_payoffs(){
        let mut prepared=CfrSession::new();
        let mut legacy=CfrSession::new();
        let actors=[0,1,1,-1,-1,-1,-1];
        let offsets=[0,2,4,6,6,6,6];
        let counts=[2,2,2,0,0,0,0];
        let edges=[1,2,3,4,5,6];
        let handle=prepared.prepare_tree_internal(&actors,&offsets,&counts,&edges).unwrap();
        assert_eq!(handle,0);
        for i in 0..300 {
            // A different pair of private-hand keys shares the public topology.
            let ids=if i%2==0 {[0,1,1,0,0,0,0]} else {[2,3,3,0,0,0,0]};
            let payoffs=if i%3==0 {[0.,0.,0.,1.,-1.,-1.,1.]}
                else {[0.,0.,0.,-1.,1.,1.,-1.]};
            let weight=if i%5==0 {2.5}else{0.75};
            prepared.step_prepared_internal(handle,&ids,&payoffs,weight).unwrap();
            legacy.step_internal(&actors,&ids,&offsets,&counts,&edges,&payoffs,weight).unwrap();
        }
        assert_eq!(prepared.information_set_count(),legacy.information_set_count());
        assert_eq!(prepared.average_strategy(),legacy.average_strategy());
    }
    #[test]
    fn prepared_topology_rejects_bad_samples_without_changing_strategy(){
        let mut session=CfrSession::new();
        let actors=[0,1,1,-1,-1,-1,-1];
        let offsets=[0,2,4,6,6,6,6];
        let counts=[2,2,2,0,0,0,0];
        let edges=[1,2,3,4,5,6];
        assert!(session.prepare_tree_internal(&actors,&offsets,&counts,
            &[1,2,3,4,5,0]).is_err()); // cycle through root
        let handle=session.prepare_tree_internal(&actors,&offsets,&counts,&edges).unwrap();
        let ids=[0,1,1,0,0,0,0];
        let good=[0.,0.,0.,1.,-1.,-1.,1.];
        session.step_prepared_internal(handle,&ids,&good,1.).unwrap();
        let before=session.average_strategy();
        assert!(session.step_prepared_internal(handle,&[0,3,3,0,0,0,0],
            &good,1.).is_err()); // gap in new info-set IDs
        assert!(session.step_prepared_internal(handle,&ids,
            &[0.,0.,0.,f64::NAN,-1.,-1.,1.],1.).is_err());
        assert!(session.step_prepared_internal(handle+1,&ids,&good,1.).is_err());
        assert_eq!(session.iterations(),1);
        assert_eq!(session.average_strategy(),before);
        session.step_prepared_internal(handle,&ids,&good,1.).unwrap();
        assert_eq!(session.iterations(),2);
    }


    #[test]
    fn prepared_batch_matches_sequential_samples_exactly(){
        let mut batched=CfrSession::new();
        let mut serial=CfrSession::new();
        let actors=[0,1,1,-1,-1,-1,-1];
        let offsets=[0,2,4,6,6,6,6];
        let counts=[2,2,2,0,0,0,0];
        let edges=[1,2,3,4,5,6];
        let handle=batched.prepare_tree_internal(&actors,&offsets,&counts,&edges).unwrap();
        let serial_handle=serial.prepare_tree_internal(&actors,&offsets,&counts,&edges).unwrap();
        let mut ids=Vec::new();
        let mut payoffs=Vec::new();
        let mut weights=Vec::new();
        for i in 0..16 {
            let group=(i%4) as u32;
            let info=[2*group,2*group+1,2*group+1,0,0,0,0];
            let utility=if i%2==0 {[0.,0.,0.,1.,-1.,-1.,1.]}
                else {[0.,0.,0.,-2.,1.,2.,-1.]};
            let weight=if i%3==0 {1.5}else{0.25};
            ids.extend_from_slice(&info);
            payoffs.extend_from_slice(&utility);
            weights.push(weight);
            serial.step_prepared_internal(serial_handle,&info,&utility,weight).unwrap();
        }
        assert_eq!(batched.step_prepared_batch_internal(handle,&ids,&payoffs,&weights).unwrap(),16);
        assert_eq!(batched.information_set_count(),serial.information_set_count());
        assert_eq!(batched.average_strategy(),serial.average_strategy());
        assert_eq!(batched.iterations(),serial.iterations());
    }
    #[test]
    fn invalid_prepared_batch_is_atomic_and_recoverable(){
        let mut session=CfrSession::new();
        let actors=[0,1,1,-1,-1,-1,-1];
        let offsets=[0,2,4,6,6,6,6];
        let counts=[2,2,2,0,0,0,0];
        let edges=[1,2,3,4,5,6];
        let handle=session.prepare_tree_internal(&actors,&offsets,&counts,&edges).unwrap();
        let info=[0,1,1,0,0,0,0];
        let utility=[0.,0.,0.,1.,-1.,-1.,1.];
        session.step_prepared_internal(handle,&info,&utility,1.).unwrap();
        let before=session.average_strategy();
        let ids=[0,1,1,0,0,0,0, 2,4,4,0,0,0,0];
        let payoffs=[0.,0.,0.,1.,-1.,-1.,1.,
                     0.,0.,0.,-1.,1.,1.,-1.];
        assert!(session.step_prepared_batch_internal(handle,&ids,&payoffs,&[1.,1.]).is_err());
        assert_eq!(session.iterations(),1);
        assert_eq!(session.information_set_count(),2);
        assert_eq!(session.average_strategy(),before);
        let mut bad=payoffs;
        bad[9]=f64::NAN;
        assert!(session.step_prepared_batch_internal(handle,&ids,&bad,&[1.,1.]).is_err());
        assert!(session.step_prepared_batch_internal(handle,&ids[..7],&payoffs,&[1.,1.]).is_err());
        assert_eq!(session.iterations(),1);
        let ids=[0,1,1,0,0,0,0, 2,3,3,0,0,0,0];
        session.step_prepared_batch_internal(handle,&ids,&payoffs,&[1.,1.]).unwrap();
        assert_eq!(session.iterations(),3);
    }


    #[test]
    fn compiled_terminal_payoffs_equal_explicit_batch_for_all_outcomes(){
        let mut compact=CfrSession::new();
        let mut explicit=CfrSession::new();
        let actors=[0,1,1,-1,-1,-1,-1];
        let offsets=[0,2,4,6,6,6,6];
        let counts=[2,2,2,0,0,0,0];
        let edges=[1,2,3,4,5,6];
        let kinds=[0,0,0,3,3,1,2];
        let pots=[0.,0.,0.,10.,20.,30.,40.];
        let invested=[0.,0.,0.,3.,5.,7.,9.];
        let hc=compact.prepare_tree_internal(&actors,&offsets,&counts,&edges).unwrap();
        let he=explicit.prepare_tree_internal(&actors,&offsets,&counts,&edges).unwrap();
        compact.prepare_payoffs_internal(hc,&kinds,&pots,&invested).unwrap();
        for start in (0..120).step_by(8) {
            let mut ids=Vec::new();
            let mut payoffs=Vec::new();
            let mut outcomes=Vec::new();
            let mut weights=Vec::new();
            for i in start..start+8 {
                let group=(i%3) as u32;
                ids.extend_from_slice(&[2*group,2*group+1,2*group+1,0,0,0,0]);
                let result=if i%3==0 {1}else if i%3==1 {0}else{-1};
                let win=|pot:f64,invest:f64|if result>0 {pot-invest}
                    else if result==0 {pot/2.-invest}else{-invest};
                payoffs.extend_from_slice(&[0.,0.,0.,win(10.,3.),win(20.,5.),23.,-9.]);
                outcomes.push(result);
                weights.push(if i%4==0 {3.}else{1.25});
            }
            compact.step_prepared_outcome_batch_internal(hc,&ids,&outcomes,&weights).unwrap();
            explicit.step_prepared_batch_internal(he,&ids,&payoffs,&weights).unwrap();
        }
        assert_eq!(compact.average_strategy(),explicit.average_strategy());
        assert_eq!(compact.information_set_count(),explicit.information_set_count());
    }
    #[test]
    fn invalid_payout_metadata_and_outcomes_leave_session_unchanged(){
        let mut session=CfrSession::new();
        let actors=[0,1,1,-1,-1,-1,-1];
        let offsets=[0,2,4,6,6,6,6];
        let counts=[2,2,2,0,0,0,0];
        let edges=[1,2,3,4,5,6];
        let h=session.prepare_tree_internal(&actors,&offsets,&counts,&edges).unwrap();
        let kinds=[0,0,0,3,3,1,2];
        let pots=[0.,0.,0.,10.,20.,30.,40.];
        let invested=[0.,0.,0.,3.,5.,7.,9.];
        assert!(session.step_prepared_outcome_batch_internal(h,&[0,1,1,0,0,0,0],&[1],&[1.]).is_err());
        assert!(session.prepare_payoffs_internal(h,&[0,0,0,0,3,1,2],&pots,&invested).is_err());
        session.prepare_payoffs_internal(h,&kinds,&pots,&invested).unwrap();
        let info=[0,1,1,0,0,0,0];
        session.step_prepared_outcome_batch_internal(h,&info,&[1],&[1.]).unwrap();
        let before=session.average_strategy();
        assert!(session.step_prepared_outcome_batch_internal(h,&info,&[2],&[1.]).is_err());
        assert!(session.step_prepared_outcome_batch_internal(h,&info,&[1],&[-1.]).is_err());
        assert!(session.step_prepared_outcome_batch_internal(h,&[0,3,3,0,0,0,0],&[1],&[1.]).is_err());
        assert_eq!(session.iterations(),1);
        assert_eq!(session.average_strategy(),before);
    }

    #[test]
    fn actor_and_action_count_must_match_prior_information_set(){
        let mut session=CfrSession::new();
        sample(&mut session,[1.,-1.,-1.,1.],1.);
        assert!(session.step_internal(&[1,-1,-1],&[0,0,0],&[0,2,2],
            &[2,0,0],&[1,2],&[0.,1.,-1.],1.).is_err());
    }
}
