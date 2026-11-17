/**
 * Select a weighted range combo using a cumulative distribution built once.
 *
 * Replaces O(range.length) summation plus a second O(range.length) walk
 * on every Monte-Carlo sample with O(log range.length) selection.
 * One random draw per selection, as in the original V1 weightedChoice().
 */
export function createWeightedPicker<T extends {weight:number}>(
  items:readonly T[],
  random:()=>number=Math.random
):()=>T {
  if(!items.length)throw new RangeError("Weighted range cannot be empty");
  const cumulative=new Float64Array(items.length);
  let total=0;
  let monotonic=true;
  for(let index=0;index<items.length;index++){
    const weight=items[index]!.weight;
    if(!Number.isFinite(weight)||weight<0)monotonic=false;
    total+=weight;
    cumulative[index]=total;
  }
  // Preserve V1's linear behavior for degenerate/invalid legacy payloads.
  // They should be rejected upstream, but the optimization must not silently
  // change which combo is chosen while V1 remains the behavioral oracle.
  if(!monotonic||!Number.isFinite(total)||total<=0){
    return ()=>{
      let cursor=random()*total;
      for(const item of items){
        cursor-=item.weight;
        if(cursor<=0)return item;
      }
      return items[items.length-1]!;
    };
  }
  return ()=>{
    const cursor=random()*total;
    let low=0,high=items.length-1;
    while(low<high){
      const middle=low+((high-low)>>1);
      if(cursor<=cumulative[middle]!)high=middle;
      else low=middle+1;
    }
    return items[low]!;
  };
}
