/** Privacy-preserving strategic snapshot. The poker engine remains authoritative:
 * this adapter does not generate bets, mutate gameplay, or infer hidden cards.
 *
 * It describes 2–6 seat NLHE public states. The numerical CFR+ backend remains
 * limited to hero-to-act postflop heads-up; unsupported cases are explicit.
 */
import {
  createSolverInput,resolveSolverInput,
  type SolverCard,type SolverStateInput,type SolverInputSnapshot
} from "./input-contract.ts";

export type StrategicStreet="waiting"|"preflop"|"flop"|"turn"|"river"|"showdown";
export type StrategicQuality="sampled_estimate"|"unavailable";
export type StrategicLegalAction="fold"|"check"|"call"|"bet"|"raise";

export interface StrategicAction {
  readonly action:StrategicLegalAction;
  /** Chips required for a call, or the minimum legal additional bet. */
  readonly amount?:number;
  /** Inclusive minimum/maximum targets on this street (not raise-by). */
  readonly minTo?:number;
  readonly maxTo?:number;
}
export interface StrategicPlayer {
  readonly id:string;
  readonly seat:number;
  readonly position:string|null;
  readonly isHuman:boolean;
  readonly folded:boolean;
  readonly allIn:boolean;
  readonly stack:number;
  readonly streetBet:number;
  readonly totalContribution:number;
  readonly amountToCall:number;
  /** Unexposed bot cards always remain unknown, even if held by the engine. */
  readonly knownPrivateCards:readonly SolverCard[]|null;
  readonly rangeSource:"not_estimated";
}
export interface StrategicPot {
  readonly amount:number;
  readonly lowerLevel:number;
  readonly upperLevel:number;
  readonly contributors:readonly string[];
  readonly eligiblePlayers:readonly string[];
  /** Single-player layers may represent uncalled action until settlement. */
  readonly contested:boolean;
}
export interface StrategicHistoryEvent {
  readonly kind:string;
  readonly street:string;
  readonly playerId:string|null;
  readonly action:string|null;
  /** New chips contributed; this is never interpreted as a raise-to. */
  readonly amount:number|null;
  /** Exact target total bet on this street, only when explicitly recorded. */
  readonly raiseTo:number|null;
  readonly timestamp:number;
}
export interface StrategicGameState {
  readonly schemaVersion:1;
  readonly variant:"NLHE";
  readonly gameId:string;
  readonly handId:string;
  readonly stateVersion:number;
  readonly fingerprint:string;
  readonly street:StrategicStreet;
  readonly board:readonly SolverCard[];
  readonly players:readonly StrategicPlayer[];
  readonly activePlayerIds:readonly string[];
  readonly foldedPlayerIds:readonly string[];
  readonly currentActor:string|null;
  /** Seats still owed an action by the poker engine, in engine order. */
  readonly pendingSeats:readonly number[];
  readonly dealerSeat:number;
  readonly smallBlind:number;
  readonly bigBlind:number;
  readonly ante:0;
  readonly pot:number;
  readonly currentBet:number;
  readonly lastFullRaise:number;
  readonly minimumRaiseTo:number;
  readonly sidePots:readonly StrategicPot[];
  readonly legalActions:readonly StrategicAction[];
  readonly history:readonly StrategicHistoryEvent[];
  readonly capability:Readonly<{quality:StrategicQuality;reason:string;solver:"heads-up-cfr-plus"|"none"}>;
  readonly handComplete:boolean;
}

function chips(value:unknown,name:string):number {
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*2))||
     Math.abs(n*2-Math.round(n*2))>1e-6)
    throw new RangeError("État stratégique : montant invalide ("+name+").");
  return Math.round(n*2)/2;
}
function cardId(card:SolverCard):string {
  if(!card||!Number.isInteger(card.value)||card.value<2||card.value>14||
     !["clubs","diamonds","hearts","spades"].includes(card.suit))
    throw new RangeError("État stratégique : carte invalide.");
  return card.value+"_"+card.suit;
}
function immutableCard(card:SolverCard):SolverCard {
  cardId(card);
  return Object.freeze({value:card.value,suit:card.suit});
}
function legalActions(
  actor:SolverInputSnapshot["state"]["players"][number]|undefined,
  toCall:number
):readonly StrategicAction[] {
  if(!actor||actor.folded||actor.allIn||actor.stack<=0||!actor.actionOptions)
    return Object.freeze([]);
  const opts=actor.actionOptions;
  const actions:StrategicAction[]=[];
  const boolean=(name:string)=>opts[name]===true;
  if(boolean("canFold"))actions.push(Object.freeze({action:"fold" as const}));
  if(boolean("canCheck")&&toCall===0)
    actions.push(Object.freeze({action:"check" as const}));
  if(boolean("canCall")&&toCall>0)
    actions.push(Object.freeze({action:"call" as const,
      amount:Math.min(toCall,actor.stack)}));
  if(boolean("canBet")){
    const minimum=chips(opts.minimumBet??0,"minimumBet");
    const maximum=chips(opts.maximumBet??actor.stack,"maximumBet");
    if(minimum>0&&maximum>=minimum)
      actions.push(Object.freeze({action:"bet" as const,
        minTo:minimum,maxTo:maximum}));
  }
  if(boolean("canRaise")){
    const minimum=chips(opts.minimumRaiseTo??0,"minimumRaiseTo");
    const maximum=chips(opts.maximumRaiseTo??(actor.stack+actor.streetBet),"maximumRaiseTo");
    if(minimum>actor.streetBet+toCall && maximum>=minimum)
      actions.push(Object.freeze({action:"raise" as const,
        minTo:minimum,maxTo:maximum}));
  }
  return Object.freeze(actions);
}
/** Rebuild chip layers without touching poker-engine accounting. Folded
 * contributions remain in the pot, but folded players cannot win it.
 */
function buildStrategicPots(players:readonly StrategicPlayer[]):readonly StrategicPot[] {
  const levels=[...new Set(players.map(p=>p.totalContribution).filter(n=>n>0))]
    .sort((a,b)=>a-b);
  const pots:StrategicPot[]=[];
  let previous=0;
  for(const level of levels){
    const involved=players.filter(p=>p.totalContribution>=level);
    const contributors=involved.map(p=>p.id);
    const eligible=involved.filter(p=>!p.folded).map(p=>p.id);
    // The existing game engine also assigns a dead-money-only layer to the
    // remaining players. Never turn a folded player's cards into blockers.
    if(!eligible.length)eligible.push(...players.filter(p=>!p.folded).map(p=>p.id));
    const amount=chips((level-previous)*involved.length,"sidePot");
    if(amount){
      pots.push(Object.freeze({
        amount,lowerLevel:previous,upperLevel:level,
        contributors:Object.freeze(contributors),
        eligiblePlayers:Object.freeze(eligible),
        contested:eligible.length>1
      }));
    }
    previous=level;
  }
  return Object.freeze(pots);
}
/** Construct a canonical, frozen public snapshot from a raw game state or
 * an existing versioned solver input. Caller owns the monotonically increasing
 * stateVersion; the fingerprint includes all public gameplay history.
 */
export function createStrategicGameState(
  input:SolverStateInput|SolverInputSnapshot,
  options:{gameId?:string;stateVersion?:number;history?:unknown}={}
):StrategicGameState {
  const gameId=options.gameId??"pokerlab-local";
  const version=options.stateVersion??1;
  if(!gameId||!Number.isSafeInteger(version)||version<1)
    throw new RangeError("Identité ou version stratégique invalide.");
  const source=resolveSolverInput(input,options.history) as {
    state:SolverStateInput;history:unknown[];
  };
  // Re-sanitize ALL inputs, including already versioned snapshots. This
  // prevents a malformed or tampered snapshot from exposing bot hole cards.
  const snapshot=createSolverInput(source.state,source.history);
  const state=snapshot.state;
  const street=state.street as StrategicStreet;
  const streets:Record<string,number>={waiting:0,preflop:0,flop:3,turn:4,river:5,showdown:5};
  if(!(street in streets)||state.board.length!==streets[street])
    throw new RangeError("État stratégique : street et board incohérents.");
  if(state.players.length<2||state.players.length>6)
    throw new RangeError("État stratégique : 2 à 6 sièges attendus.");
  if(!Number.isSafeInteger(state.dealerIndex??0)||
     (state.dealerIndex??0)<0||(state.dealerIndex??0)>=state.players.length)
    throw new RangeError("État stratégique : position du bouton invalide.");
  const ids=new Set<string>(),usedCards=new Set<string>();
  const board=Object.freeze(state.board.map(immutableCard));
  for(const card of board){
    const id=cardId(card);
    if(usedCards.has(id))throw new RangeError("État stratégique : carte dupliquée.");
    usedCards.add(id);
  }
  const players:StrategicPlayer[]=state.players.map((player,seat)=>{
    if(typeof player.id!=="string"||!player.id||ids.has(player.id))
      throw new RangeError("État stratégique : identifiants dupliqués ou invalides.");
    ids.add(player.id);
    const knownCards=player.isHuman&&player.holeCards?
      Object.freeze(player.holeCards.map(immutableCard)):null;
    if(knownCards&&knownCards.length!==2)
      throw new RangeError("État stratégique : deux cartes privées attendues.");
    if(knownCards)for(const card of knownCards){
      const id=cardId(card);
      if(usedCards.has(id))throw new RangeError("État stratégique : carte dupliquée.");
      usedCards.add(id);
    }
    const stack=chips(player.stack,"stack");
    const streetBet=chips(player.streetBet,"streetBet");
    const totalContribution=chips(player.totalContribution,"totalContribution");
    if(streetBet>totalContribution)
      throw new RangeError("État stratégique : contribution de street excessive.");
    return Object.freeze({
      id:player.id,seat,position:player.position,isHuman:player.isHuman,
      folded:player.folded,allIn:player.allIn,stack,streetBet,
      totalContribution,amountToCall:chips(player.amountToCall,"amountToCall"),
      knownPrivateCards:knownCards,rangeSource:"not_estimated" as const
    });
  });
  const pot=chips(state.pot,"pot");
  const contributions=players.reduce((sum,player)=>sum+player.totalContribution,0);
  if(Math.abs(pot-contributions)>1e-6)
    throw new RangeError("État stratégique : pot et contributions incompatibles.");
  const currentBet=chips(state.currentBet,"currentBet");
  if(Math.abs(currentBet-Math.max(...players.map(p=>p.streetBet)))>1e-6)
    throw new RangeError("État stratégique : mise courante incohérente.");
  const currentActor=state.currentPlayerId??null;
  if(currentActor!==null&&(!ids.has(currentActor)||
     players.some(p=>p.id===currentActor&&p.folded)))
    throw new RangeError("État stratégique : joueur actif invalide.");
  const actorInput=state.players.find(player=>player.id===currentActor);
  const actor=players.find(player=>player.id===currentActor);
  const legal=legalActions(actorInput,actor?.amountToCall??0);
  const active=Object.freeze(players.filter(p=>!p.folded).map(p=>p.id));
  const folded=Object.freeze(players.filter(p=>p.folded).map(p=>p.id));
  const history=Object.freeze(snapshot.history.map(event=>{
    const data=event.data;
    const amount=data.amount===undefined||data.amount===null?null:chips(data.amount,"action.amount");
    // Never derive raise-to from a raise-by or contributed amount.
    const explicitTo=data.raiseTo??data.betTo;
    const raiseTo=explicitTo===undefined||explicitTo===null?null:
      chips(explicitTo,"action.raiseTo");
    return Object.freeze({
      kind:event.type??"unknown",street:event.street??"unknown",
      playerId:typeof data.playerId==="string"?data.playerId:null,
      action:typeof data.action==="string"?data.action:null,
      amount,raiseTo,timestamp:event.timestamp
    });
  }));
  const sidePots=buildStrategicPots(players);
  const hero=players.find(p=>p.isHuman&&p.knownPrivateCards?.length===2);
  const supported=!state.handComplete&&["flop","turn","river"].includes(street)&&
    active.length===2&&hero?.id===currentActor&&
    actor!==undefined&&!actor.allIn&&actor.stack>0&&legal.length>0&&
    sidePots.every(p=>p.eligiblePlayers.length>0);
  const capability=Object.freeze({
    quality:supported?"sampled_estimate" as const:"unavailable" as const,
    reason:supported?
      "Heads-up postflop CFR+ échantillonné : équilibre du No-Limit complet non certifié.":
      "Sous-jeu non pris en charge : le moteur numérique exige un heads-up postflop au tour du héros.",
    solver:supported?"heads-up-cfr-plus" as const:"none" as const
  });
  const handId=gameId+":"+String(state.handNumber??0);
  const fingerprint=JSON.stringify({gameId,snapshot});
  return Object.freeze({
    schemaVersion:1 as const,variant:"NLHE" as const,
    gameId,handId,stateVersion:version,fingerprint,street,
    board,players:Object.freeze(players),activePlayerIds:active,
    foldedPlayerIds:folded,currentActor,
    pendingSeats:Object.freeze(state.pendingPlayers.filter(seat=>
      Number.isSafeInteger(seat)&&seat>=0&&seat<players.length)),
    dealerSeat:state.dealerIndex??0,
    smallBlind:chips(state.blinds.smallBlind,"SB"),
    bigBlind:chips(state.blinds.bigBlind,"BB"),ante:0 as const,pot,
    currentBet,lastFullRaise:chips(state.lastFullRaise,"lastFullRaise"),
    minimumRaiseTo:chips(state.minimumRaiseTo,"minimumRaiseTo"),
    sidePots,legalActions:legal,history,capability,
    handComplete:state.handComplete
  });
}
