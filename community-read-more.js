const style = document.createElement('style');
style.textContent = `
  .community-post-body.is-collapsible {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    overflow: hidden;
  }
  .community-post-body.is-collapsible.is-expanded {
    display: block;
    overflow: visible;
  }
  .post-read-more {
    display: inline-block;
    margin: 7px 0 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: #0ccfbd;
    font: inherit;
    font-size: .86rem;
    font-weight: 900;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .post-read-more:hover,
  .post-read-more:focus { color: #7ff7ec; }
`;
document.head.appendChild(style);

function needsCollapse(body) {
  if (!body) return false;
  const text = (body.textContent || '').trim();
  if (text.length > 280) return true;
  return text.split(/\n/).filter(line => line.trim()).length > 4;
}

function installReadMore(article) {
  if (article.dataset.readMoreReady === 'true') return;
  const body = article.querySelector('.community-post-body');
  if (!body) return;

  article.dataset.readMoreReady = 'true';
  if (!needsCollapse(body)) return;

  body.classList.add('is-collapsible');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'post-read-more';
  button.textContent = 'View More';
  button.setAttribute('aria-expanded', 'false');

  button.addEventListener('click', () => {
    const expanded = body.classList.toggle('is-expanded');
    button.textContent = expanded ? 'Show Less' : 'View More';
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });

  body.insertAdjacentElement('afterend', button);
}

function scan() {
  document.querySelectorAll('.community-post').forEach(installReadMore);
}

const feed = document.getElementById('feed');
if (feed) new MutationObserver(scan).observe(feed, { childList: true, subtree: true });
scan();
