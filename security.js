// GitHub Pages cannot attach custom frame-ancestors/X-Frame-Options headers.
// Fail closed before application initialization in ALL embedded contexts.
// Deploy an HTTP frame-ancestors 'none' header as well when using a proxy.
if(window.self!==window.top){
  document.documentElement.hidden=true;
  document.documentElement.setAttribute('data-embedded','');
  window.addEventListener('DOMContentLoaded',()=>{
    document.body.replaceChildren();
  },{once:true});
}
