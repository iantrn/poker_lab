/** Versioned, privacy-preserving solver snapshot. Equivalent to V1 createInput. */
export interface SolverCard { value: number; suit: string }
export interface SolverPlayerInput {
  id: string; name: string;
  isHuman?: boolean; isBot?: boolean;
  botProfile?: string | null; botDifficulty?: string | null;
  position?: string | null; stack?: number;
  streetBet?: number; totalContribution?: number;
  folded?: boolean; allIn?: boolean; hasActed?: boolean;
  lastActedBet?: number; amountToCall?: number;
  holeCards?: SolverCard[] | null;
  actionOptions?: Record<string, unknown> | null;
}
export interface SolverStateInput {
  handNumber?: number; street: string; board: SolverCard[];
  pot?: number; currentBet?: number; lastFullRaise?: number;
  minimumRaiseTo?: number;
  blinds?: {smallBlind: number; bigBlind: number} | null;
  dealerIndex?: number; currentPlayerId?: string | null;
  pendingPlayers?: number[]; handComplete?: boolean;
  players: SolverPlayerInput[];
}
export interface SolverHistoryEvent {
  type?: string; street?: string; timestamp?: number;
  data?: Record<string, unknown> | null;
}
export interface SolverInputSnapshot {
  schemaVersion: 1;
  state: {
    handNumber?: number; street: string; board: SolverCard[];
    pot: number; currentBet: number; lastFullRaise: number; minimumRaiseTo: number;
    blinds: { smallBlind:number;bigBlind:number };
    dealerIndex?:number;currentPlayerId?:string|null;
    pendingPlayers:number[];handComplete:boolean;
    players: Array<{
      id:string;name:string;isHuman:boolean;isBot:boolean;
      botProfile:string|null;botDifficulty:string|null;position:string|null;
      stack:number;streetBet:number;totalContribution:number;
      folded:boolean;allIn:boolean;hasActed:boolean;
      lastActedBet:number;amountToCall:number;
      holeCards:SolverCard[]|null;actionOptions:Record<string, unknown>|null;
    }>;
  };
  history: Array<{type?:string;street?:string;timestamp:number;data:Record<string,unknown>}>;
}
const ALLOWED_HISTORY_FIELDS = [
  "playerId","playerName","action","amount","pot",
  "potBefore","potAfter","currentBetBefore","currentBetAfter",
  "streetBetBefore","streetBetAfter","stackBefore","stackAfter",
  "totalContributionBefore","totalContributionAfter",
  "betTo","raiseTo","raiseSize","isFullRaise",
  "lastFullRaiseBefore","lastFullRaiseAfter","allIn",
  "street","board","smallBlind","smallBlindAmount",
  "bigBlind","bigBlindAmount","winnerId"
] as const;

export function resolveSolverInput(
  input: unknown, history: unknown = []
): {state:unknown;history:unknown[]} {
  if (input && Object.prototype.hasOwnProperty.call(input,"schemaVersion")) {
    const versioned = input as Partial<SolverInputSnapshot> & {schemaVersion?:unknown};
    if (versioned.schemaVersion !== 1 || !versioned.state) {
      throw new Error("Version du contrat de données du solveur non prise en charge.");
    }
    return {
      state: versioned.state,
      history: Array.isArray(versioned.history) ? versioned.history : []
    };
  }
  return {state:input,history:Array.isArray(history) ? history:[]};
}

export function createSolverInput(state: SolverStateInput | null, history: unknown = []): SolverInputSnapshot {
  if (!state || !Array.isArray(state.players)) {
    throw new Error("Impossible de construire les données du solveur : état invalide.");
  }
  const chipAmount = (value:unknown,label:string):number => {
    const amount = value === undefined || value === null ? 0 : Number(value);
    if (!Number.isFinite(amount) || amount < 0 ||
        Math.abs(amount * 2 - Math.round(amount * 2)) > 0.000001) {
      throw new Error("Contrat du solveur invalide : " + label + " doit respecter les incréments de 0,5 jeton.");
    }
    return amount;
  };
  const players = state.players.map(player => ({
    id:player.id,
    name:player.name,
    isHuman:Boolean(player.isHuman),
    isBot:Boolean(player.isBot),
    botProfile:player.botProfile || null,
    botDifficulty:player.botDifficulty || null,
    position:player.position || null,
    stack:chipAmount(player.stack,"stack"),
    streetBet:chipAmount(player.streetBet,"streetBet"),
    totalContribution:chipAmount(player.totalContribution,"totalContribution"),
    folded:Boolean(player.folded),
    allIn:Boolean(player.allIn),
    hasActed:Boolean(player.hasActed),
    lastActedBet:chipAmount(player.lastActedBet,"lastActedBet"),
    amountToCall:chipAmount(player.amountToCall,"amountToCall"),
    holeCards:player.isHuman && Array.isArray(player.holeCards)
      ? player.holeCards.map(card=>({value:card.value,suit:card.suit})) : null,
    actionOptions:player.isHuman && player.actionOptions
      ? {...player.actionOptions} : null
  }));
  const events:Array<SolverHistoryEvent | null> = Array.isArray(history) ? history : [];
  const safeHistory=events.map(event=>{
    const data:Record<string,unknown>={};
    for(const key of ALLOWED_HISTORY_FIELDS){
      if(event && event.data && Object.prototype.hasOwnProperty.call(event.data,key)){
        const value=event.data[key];
        data[key]=key==="board" && Array.isArray(value)
          ? (value as SolverCard[]).map(card=>({value:card.value,suit:card.suit}))
          : value;
      }
    }
    return {
      type:event?.type,
      street:event?.street,
      timestamp:Number(event?.timestamp)||0,
      data
    };
  });
  const snapshot = {
    handNumber:state.handNumber,
    street:state.street,
    board:(state.board || []).map(card=>({value:card.value,suit:card.suit})),
    pot:chipAmount(state.pot,"pot"),
    currentBet:chipAmount(state.currentBet,"currentBet"),
    lastFullRaise:chipAmount(state.lastFullRaise,"lastFullRaise"),
    minimumRaiseTo:chipAmount(state.minimumRaiseTo,"minimumRaiseTo"),
    blinds:state.blinds ? {...state.blinds} : {smallBlind:0.5,bigBlind:1},
    dealerIndex:state.dealerIndex,
    currentPlayerId:state.currentPlayerId,
    pendingPlayers:Array.isArray(state.pendingPlayers)?state.pendingPlayers.slice():[],
    handComplete:Boolean(state.handComplete),
    players
  };
  return {schemaVersion:1,state:snapshot,history:safeHistory};
}
type SolverGlobal = Window & {
  PokerLabPostflopSolver?: {createInput:typeof createSolverInput;resolveInput:typeof resolveSolverInput};
};
export function installSolverInputContract(): void {
  const target=window as SolverGlobal;
  if (!target.PokerLabPostflopSolver) throw new Error("Le solveur postflop n'est pas installé.");
  target.PokerLabPostflopSolver.createInput=createSolverInput;
  target.PokerLabPostflopSolver.resolveInput=resolveSolverInput;
}
