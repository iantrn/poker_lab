/** An independent exact arithmetic verifier for *explicit finite* extensive-form
 * games with 2–6 players and perfect recall. This is NOT a certification of
 * unrestricted No-Limit Hold'em; a sampled / abstracted chance model cannot be
 * silently promoted to a full-game Nash equilibrium.
 *
 * All utilities, policies and chance probabilities are rational NUMERATOR /
 * DENOMINATOR strings. No floating point arithmetic enters the proof.
 * An exact best response is computed for EACH player by counterfactual
 * dynamic programming over information sets, not individual game nodes.
 */
export interface ExactFraction{readonly numerator:string;readonly denominator:string}
export interface ExactTerminal{
  readonly kind:"terminal";
  readonly payoffs:readonly ExactFraction[];
}
export interface ExactDecision{
  readonly kind:"decision";
  readonly player:number;
  readonly informationSet:string;
  readonly actions:readonly {readonly label:string;readonly child:ExactNode}[];
}
export interface ExactChance{
  readonly kind:"chance";
  readonly outcomes:readonly {readonly probability:ExactFraction;readonly child:ExactNode}[];
}
export type ExactNode=ExactTerminal|ExactDecision|ExactChance;
export interface ExplicitFiniteGame{
  readonly players:number;
  readonly root:ExactNode;
  /** Complete strategy profile for the explicitly supplied finite tree. */
  readonly profile:Readonly<Record<string,readonly ExactFraction[]>>;
}
export interface FiniteNashCertificate{
  readonly scope:"explicit_finite_game_only";
  readonly fullNoLimitHoldemCertified:false;
  readonly perfectRecallVerified:true;
  readonly arithmetic:"exact_rational_bigint";
  readonly players:number;
  readonly nodes:number;
  readonly informationSets:number;
  readonly epsilon:ExactFraction;
  readonly epsilonNashCertified:boolean;
  readonly exactNashCertified:boolean;
  readonly playerValues:readonly ExactFraction[];
  readonly bestResponseValues:readonly ExactFraction[];
  readonly deviationGains:readonly ExactFraction[];
  readonly maxDeviationGain:ExactFraction;
  readonly nashConv:ExactFraction;
  readonly proof:"exhaustive_finite_tree_and_exact_best_responses";
}
interface Q{n:bigint;d:bigint}
const Z:Q={n:0n,d:1n},O:Q={n:1n,d:1n};
const MAX_NODES=18_000,MAX_INFOSETS=4_000,MAX_DEPTH=96;
function abs(n:bigint):bigint{return n<0n?-n:n;}
function gcd(a:bigint,b:bigint):bigint{
  a=abs(a);b=abs(b);
  while(b!==0n){const r=a%b;a=b;b=r;}
  return a;
}
function rat(n:bigint,d:bigint):Q{
  if(d===0n)throw new RangeError("Fraction exacte : division par zéro.");
  if(d<0n){n=-n;d=-d;}
  if(n===0n)return Z;
  const g=gcd(n,d);
  return {n:n/g,d:d/g};
}
function parse(value:ExactFraction,label:string):Q{
  if(!value||typeof value.numerator!=="string"||
     typeof value.denominator!=="string"||
     !/^-?(?:0|[1-9]\d{0,39})$/.test(value.numerator)||
     !/^(?:[1-9]\d{0,39})$/.test(value.denominator))
    throw new RangeError(label+" : fraction rationnelle invalide.");
  return rat(BigInt(value.numerator),BigInt(value.denominator));
}
function add(a:Q,b:Q):Q{return rat(a.n*b.d+b.n*a.d,a.d*b.d);}
function sub(a:Q,b:Q):Q{return rat(a.n*b.d-b.n*a.d,a.d*b.d);}
function mul(a:Q,b:Q):Q{return rat(a.n*b.n,a.d*b.d);}
function cmp(a:Q,b:Q):number{
  const diff=a.n*b.d-b.n*a.d;
  return diff<0n?-1:diff>0n?1:0;
}
function publicFraction(a:Q):ExactFraction{
  return {numerator:String(a.n),denominator:String(a.d)};
}
function sum(qs:readonly Q[]):Q{return qs.reduce(add,Z);}
function unit(qs:readonly Q[],label:string):void{
  if(cmp(sum(qs),O)!==0||qs.some(q=>q.n<0n||q.n>q.d))
    throw new RangeError(label+" : probabilités non normalisées.");
}
interface Item {
  kind:ExactNode["kind"];
  player:number;
  informationSet:string;
  children:number[];
  edgeProbabilities:readonly Q[];
  payoffs:readonly Q[];
}
interface Information {
  player:number;
  actions:readonly string[];
  ownHistory:string;
  previousDecisions:number;
  nodes:number[];
  policy:readonly Q[];
}
interface Compiled {
  nodes:Item[];
  infos:Map<string,Information>;
  players:number;
}
function compile(game:ExplicitFiniteGame):Compiled{
  if(!game||!Number.isInteger(game.players)||game.players<2||game.players>6||
     !game.root||typeof game.root!=="object")
    throw new RangeError("Jeu fini : 2 à 6 joueurs requis.");
  const nodes:Item[]=[],infos=new Map<string,Information>();
  const visiting=new Set<object>();
  function visit(node:ExactNode,histories:readonly string[],
    ownSteps:readonly number[],depth:number):number{
    if(depth>MAX_DEPTH||nodes.length>=MAX_NODES)
      throw new RangeError("Vérification exacte : budget de profondeur/nœuds dépassé.");
    if(!node||typeof node!=="object"||visiting.has(node))
      throw new Error("Arbre fini cyclique ou invalide.");
    visiting.add(node);
    const index=nodes.length;
    const item:Item={
      kind:node.kind,player:-1,informationSet:"",
      children:[],edgeProbabilities:[],payoffs:[]
    };
    nodes.push(item);
    try{
      if(node.kind==="terminal"){
        if(!Array.isArray(node.payoffs)||node.payoffs.length!==game.players)
          throw new Error("Vecteur terminal absent ou de dimension incorrecte.");
        item.payoffs=node.payoffs.map((q,i)=>parse(q,"gain "+i));
        if(cmp(sum(item.payoffs),Z)!==0)
          throw new Error("Conservation des jetons : somme terminale non nulle.");
      }else if(node.kind==="chance"){
        if(!Array.isArray(node.outcomes)||!node.outcomes.length||
           node.outcomes.length>52)
          throw new RangeError("Chance : nombre d'issues invalide.");
        const probabilities=node.outcomes.map((outcome,i)=>
          parse(outcome.probability,"chance "+i));
        unit(probabilities,"Chance");
        item.edgeProbabilities=probabilities;
        for(const outcome of node.outcomes)
          item.children.push(visit(outcome.child,histories,ownSteps,depth+1));
      }else if(node.kind==="decision"){
        const player=node.player;
        if(!Number.isInteger(player)||player<0||player>=game.players||
           typeof node.informationSet!=="string"||!node.informationSet||
           !Array.isArray(node.actions)||node.actions.length<1||
           node.actions.length>4)
          throw new RangeError("Décision ou information set invalide.");
        const labels=node.actions.map(action=>action.label);
        if(labels.some(label=>typeof label!=="string"||!label)||
           new Set(labels).size!==labels.length)
          throw new Error("Actions non uniques ou invalides.");
        item.player=player;item.informationSet=node.informationSet;
        const existing=infos.get(node.informationSet);
        if(existing){
          if(existing.player!==player||
             existing.ownHistory!==histories[player]||
             existing.actions.length!==labels.length||
             labels.some((label,i)=>label!==existing.actions[i]))
            throw new Error("Imperfect recall, acteur ou actions incohérents.");
          existing.nodes.push(index);
        }else{
          if(infos.size>=MAX_INFOSETS)
            throw new RangeError("Budget exact d'information sets dépassé.");
          const fractions=game.profile[node.informationSet];
          if(!Array.isArray(fractions)||fractions.length!==labels.length)
            throw new Error("Stratégie exacte manquante pour "+node.informationSet);
          const policy=fractions.map((q,i)=>parse(q,node.informationSet+" action "+i));
          unit(policy,"Stratégie "+node.informationSet);
          infos.set(node.informationSet,{
            player,actions:labels,ownHistory:histories[player]!,
            previousDecisions:ownSteps[player]!,nodes:[index],policy
          });
        }
        for(let action=0;action<node.actions.length;action++){
          const history=histories.slice(),steps=ownSteps.slice();
          // Full own action sequence: two indistinguishable states must
          // never disagree about their actor's own earlier information.
          history[player]=histories[player]+
            JSON.stringify([node.informationSet,action])+";";
          steps[player]=ownSteps[player]!+1;
          item.children.push(visit(
            node.actions[action]!.child,history,steps,depth+1
          ));
        }
      }else throw new Error("Nœud fini inconnu.");
    }finally{visiting.delete(node);}
    return index;
  }
  visit(game.root,Array(game.players).fill(""),Array(game.players).fill(0),0);
  return {nodes,infos,players:game.players};
}
function policyValue(compiled:Compiled):Q[]{
  const {nodes,players,infos}=compiled;
  const values:Array<readonly Q[]>=new Array(nodes.length);
  for(let i=nodes.length-1;i>=0;i--){
    const node=nodes[i]!;
    if(node.kind==="terminal"){values[i]=node.payoffs;continue;}
    const probabilities=node.kind==="chance"?node.edgeProbabilities:
      infos.get(node.informationSet)!.policy;
    values[i]=Array.from({length:players},(_,player)=>
      node.children.reduce((acc,child,a)=>add(acc,
        mul(probabilities[a]!,values[child]![player]!)),Z));
  }
  return [...values[0]!];
}
/** An actual information-set best response. It optimizes one common action
 * across every indistinguishable occurrence, not a clairvoyant action chosen
 * separately for each private-hand/chance realization.
 */
function bestResponse(compiled:Compiled,player:number):Q{
  const {nodes,infos}=compiled;
  const cf:Q[]=new Array(nodes.length);
  cf[0]=O;
  for(let i=0;i<nodes.length;i++){
    const node=nodes[i]!;
    if(node.kind==="terminal")continue;
    const probabilities=node.kind==="chance"?node.edgeProbabilities:
      node.player===player?null:infos.get(node.informationSet)!.policy;
    node.children.forEach((child,a)=>{
      cf[child]=probabilities?mul(cf[i]!,probabilities[a]!):cf[i]!;
    });
  }
  const choices=new Map<string,number>();
  const memo=new Map<number,Q>();
  function weightedValue(i:number):Q{
    const cached=memo.get(i);if(cached)return cached;
    const node=nodes[i]!;
    let value:Q;
    if(node.kind==="terminal"){
      value=mul(cf[i]!,node.payoffs[player]!);
    }else if(node.kind==="decision"&&node.player===player){
      const selected=choices.get(node.informationSet);
      if(selected===undefined)
        throw new Error("BR exacte : information set descendant non résolu.");
      value=weightedValue(node.children[selected]!);
    }else{
      value=sum(node.children.map(child=>weightedValue(child)));
    }
    memo.set(i,value);
    return value;
  }
  const own=[...infos.entries()].filter(([,info])=>info.player===player)
    .sort((a,b)=>b[1].previousDecisions-a[1].previousDecisions);
  for(const [key,info] of own){
    let best=Z,bestAction=-1;
    for(let a=0;a<info.actions.length;a++){
      const value=sum(info.nodes.map(i=>
        weightedValue(nodes[i]!.children[a]!)));
      if(bestAction<0||cmp(value,best)>0){
        bestAction=a;best=value;
      }
    }
    choices.set(key,bestAction);
    // Do not cache this information set while its policy is unresolved.
  }
  return weightedValue(0);
}
/** Returns an EXACT rational epsilon-Nash certificate valid exclusively for
 * the supplied, fully specified finite extensive-form game. This is not a
 * statistical estimate, nor a certificate of unabstracted multiplayer poker.
 */
export function certifyFiniteNash(
  game:ExplicitFiniteGame,epsilon:ExactFraction={numerator:"0",denominator:"1"}
):FiniteNashCertificate{
  const tolerance=parse(epsilon,"epsilon");
  if(cmp(tolerance,Z)<0)throw new RangeError("Epsilon doit être non négatif.");
  const finite=compile(game);
  const values=policyValue(finite);
  const bests=Array.from({length:finite.players},(_,i)=>bestResponse(finite,i));
  const gains=bests.map((br,i)=>{
    const difference=sub(br,values[i]!);
    if(cmp(difference,Z)<0)
      throw new Error("Invariant de meilleure réponse violé.");
    return difference;
  });
  const highest=gains.reduce((maximum,gain)=>
    cmp(gain,maximum)>0?gain:maximum,Z);
  return Object.freeze({
    scope:"explicit_finite_game_only" as const,
    fullNoLimitHoldemCertified:false as const,
    perfectRecallVerified:true as const,
    arithmetic:"exact_rational_bigint" as const,
    players:finite.players,nodes:finite.nodes.length,
    informationSets:finite.infos.size,
    epsilon:publicFraction(tolerance),
    epsilonNashCertified:cmp(highest,tolerance)<=0,
    exactNashCertified:cmp(highest,Z)===0,
    playerValues:values.map(publicFraction),
    bestResponseValues:bests.map(publicFraction),
    deviationGains:gains.map(publicFraction),
    maxDeviationGain:publicFraction(highest),
    nashConv:publicFraction(sum(gains)),
    proof:"exhaustive_finite_tree_and_exact_best_responses" as const
  });
}
