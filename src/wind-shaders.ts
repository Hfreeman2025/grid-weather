export const fieldSampling = `uniform sampler2D field;
uniform ivec2 fieldSize;
vec4 sampleField(vec2 p){
  vec2 q=clamp(p,0.,1.)*vec2(fieldSize-1);
  ivec2 a=ivec2(floor(q)),b=min(a+1,fieldSize-1);
  vec2 t=fract(q);
  return mix(mix(texelFetch(field,a,0),texelFetch(field,ivec2(b.x,a.y),0),t.x),mix(texelFetch(field,ivec2(a.x,b.y),0),texelFetch(field,b,0),t.x),t.y);
}
`;
export const updateVertex = `#version 300 es
precision highp float;
layout(location=0)in vec4 state;
out vec4 nextState;
${fieldSampling}
uniform vec2 span;
uniform float dt;
uniform float ageDelta;
uniform float frameIndex;
float random(float x){
  return fract(sin(x*127.1+311.7)*43758.5453);
}
void main(){
  vec2 p=state.xy;
  vec2 k=sampleField(p).xy;
  vec2 mid=p+.5*dt*k/(span*1000.);
  vec2 next=p+dt*sampleField(mid).xy/(span*1000.);
  float age=state.z+ageDelta;
  if(age>8.+12.*state.w||any(lessThan(next,vec2(0.)))||any(greaterThan(next,vec2(1.)))){
    next=vec2(random(state.w+frameIndex),random(state.w+frameIndex+17.));
    age=0.;
  }
  nextState=vec4(next,age,state.w);
  gl_Position=vec4(0.);
}
`;
export const emptyFragment = `#version 300 es
precision highp float;
out vec4 colour;
void main(){
  colour=vec4(0.);
}
`;
export const particleVertex = `#version 300 es
precision highp float;
layout(location=0)in vec4 state;
${fieldSampling}
uniform vec2 origin;
uniform vec2 span;
uniform vec3 camera;
uniform vec2 resolution;
uniform float pointSize;
out float speed;
out float edge;
void main(){
  vec2 world=origin+state.xy*span;
  vec2 screen=vec2(camera.x+world.x*camera.z,camera.y-world.y*camera.z);
  gl_Position=vec4(screen.x/resolution.x*2.-1.,1.-screen.y/resolution.y*2.,0.,1.);
  gl_PointSize=pointSize;
  speed=length(sampleField(state.xy).xy);
  edge=smoothstep(0.,.065,min(min(state.x,state.y),min(1.-state.x,1.-state.y)));
}
`;
export const particleFragment = `#version 300 es
precision highp float;
in float speed;
in float edge;
out vec4 colour;
void main(){
  float t=clamp(speed/25.,0.,1.);
  vec3 c=mix(vec3(.30,.60,.69),vec3(.93,.98,.91),smoothstep(0.,.65,t));
  c=mix(c,vec3(1.,.74,.34),smoothstep(.65,1.,t));
  colour=vec4(c,.035*edge);
}
`;
export const quadVertex = `#version 300 es
layout(location=0)in vec2 position;
out vec2 uv;
void main(){
  uv=(position+1.)*.5;
  gl_Position=vec4(position,0.,1.);
}
`;
export const fadeFragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 colour;
uniform sampler2D trails;
uniform float decay;
void main(){
  colour=texture(trails,uv)*decay;
}
`;
export const compositeFragment = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 colour;
${fieldSampling}
uniform sampler2D trails;
uniform vec2 origin;
uniform vec2 span;
uniform vec3 camera;
uniform vec2 resolution;
uniform int layer;
void main(){
  vec2 screen=vec2(uv.x,1.-uv.y)*resolution;
  vec2 world=vec2((screen.x-camera.x)/camera.z,(camera.y-screen.y)/camera.z);
  vec2 p=(world-origin)/span;
  bool inside=all(greaterThanEqual(p,vec2(0.)))&&all(lessThanEqual(p,vec2(1.)));
  vec4 w=sampleField(p);
  vec4 trace=texture(trails,uv);
  if(layer==1&&inside){
    float sun=clamp(w.z/800.,0.,1.);
    vec3 c=mix(vec3(.035,.11,.15),vec3(.95,.69,.30),sqrt(sun));
    float edge=smoothstep(0.,.065,min(min(p.x,p.y),min(1.-p.x,1.-p.y)));
    colour=vec4(c,.9*edge);
  }
  else{
    colour=vec4(trace.rgb/max(trace.a,.0001),trace.a);
  }
}
`;
