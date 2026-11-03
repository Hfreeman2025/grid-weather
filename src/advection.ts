// Position in British National Grid kilometres; velocity in metres/second.
// CPU reference for the same explicit midpoint update used in the TF shader.
export function midpoint(position:[number,number],seconds:number,velocity:(x:number,y:number)=>[number,number]|null):[number,number]|null{
    if(!Number.isFinite(seconds)||seconds<0||position.some(n=>!Number.isFinite(n)))throw new Error('Invalid advection step');
    const a=velocity(...position);if(!a)return null;
    const mid:[number,number]=[position[0]+a[0]*seconds/2000,position[1]+a[1]*seconds/2000],b=velocity(...mid);if(!b)return null;
    return[position[0]+b[0]*seconds/1000,position[1]+b[1]*seconds/1000];
}
