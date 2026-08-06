// Final homepage header-logo sizing/polish.
// Kept separate from the radio/dashboard script so this override is easy to tune
// without touching any Firebase or radio functionality.
const style=document.createElement('style');
style.id='dashboard-logo-polish';
style.textContent=`
  .brand-block{
    display:flex!important;
    align-items:center!important;
    justify-content:flex-start!important;
    gap:12px!important;
  }
  .brand-copy{
    display:flex!important;
    flex-direction:column!important;
    justify-content:center!important;
  }
  .header-logo-frame{
    width:110px!important;
    height:84px!important;
    flex:0 0 110px!important;
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    overflow:visible!important;
  }
  .header-logo{
    width:100%!important;
    height:100%!important;
    max-width:none!important;
    object-fit:contain!important;
    object-position:center!important;
    transform:scale(1.08)!important;
    transform-origin:center!important;
  }
  @media(max-width:1000px){
    .brand-block{gap:8px!important}
    .header-logo-frame{width:92px!important;height:70px!important;flex-basis:92px!important}
    .header-logo{transform:scale(1.08)!important}
  }
  @media(max-width:650px){
    .brand-block{gap:7px!important;align-items:center!important}
    .header-logo-frame{width:78px!important;height:62px!important;flex-basis:78px!important}
    .header-logo{transform:scale(1.10)!important}
  }
`;
document.head.appendChild(style);
