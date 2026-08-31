import './control-room-radio-v2.js?v=7';
import './radio-playlist-save-fix.js?v=11';
import './radio-admin-playlist-tools.js?v=1';

(function addAuditionReviewToControlRoom(){
  const sections=document.querySelector('.control-sections');
  if(!sections||document.getElementById('cr-auditions-section'))return;
  const details=document.createElement('details');
  details.className='control-section';
  details.id='cr-auditions-section';
  details.innerHTML='<summary>🎤 Audition Room</summary><div class="control-section-body"><a class="control-card" href="admin-auditions.html"><div class="control-icon">▶</div><strong>Audition Review</strong><span>Approve musician auditions and bands looking for members before they go live.</span></a></div>';
  const radio=[...sections.querySelectorAll('.control-section')].find(el=>el.querySelector('summary')?.textContent.includes('Radio'));
  if(radio)sections.insertBefore(details,radio);else sections.appendChild(details);
})();
