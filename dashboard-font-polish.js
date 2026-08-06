function addDashboardFontPolish(){
  if(document.getElementById('dashboard-font-polish-style')) return;
  const style=document.createElement('style');
  style.id='dashboard-font-polish-style';
  style.textContent=`
    @media(max-width:1000px){
      .panel h3{font-size:13px!important}
      .menu a{font-size:12px!important}
      .news-label{font-size:10px!important}
      .news-group{font-size:11px!important}
      .post-meta{font-size:12px!important}
      .online-empty{font-size:11px!important}
    }
    @media(max-width:650px){
      .tag{font-size:11px!important}
      .nav a{font-size:9px!important}
      .panel h3{font-size:9px!important}
      .menu a{font-size:9px!important}
      .hero p{font-size:9px!important}
      .btn{font-size:8px!important}
      .post-name{font-size:9px!important}
      .post-meta{font-size:7px!important}
      .note{font-size:8px!important}
      .online-empty{font-size:9px!important}
      .news-label{font-size:8px!important}
      .news-group{font-size:8.5px!important}
      .radio-box small{font-size:8px!important}
    }
  `;
  document.head.appendChild(style);
}

addDashboardFontPolish();
