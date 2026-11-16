export const SIZE = 13;
export const TILE = 24;
// New compact board. 1 = wall, 0 = passage. Not an original game level.
export const MAZE = Array.from({length:SIZE},(_,y)=>Array.from({length:SIZE},(_,x)=>{
  if(x===0||y===0||x===SIZE-1||y===SIZE-1)return 1;
  if((x===4||x===8)&&![3,6,9].includes(y))return 1;
  if((y===4||y===8)&&![2,6,10].includes(x))return 1;
  return 0;
}));
export const TARGETS = [{x:1,y:1},{x:11,y:1},{x:1,y:11},{x:11,y:11}];
export const DIRECTIONS = [{x:1,y:0,key:'ArrowRight'},{x:0,y:1,key:'ArrowDown'},{x:-1,y:0,key:'ArrowLeft'},{x:0,y:-1,key:'ArrowUp'}];
