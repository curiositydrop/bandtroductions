function enhanceWelcomePosts() {
  document.querySelectorAll('.community-post:not([data-welcome-link-checked])').forEach(post => {
    post.dataset.welcomeLinkChecked = 'true';

    const body = post.querySelector('.community-post-body');
    const pillLink = post.querySelector('.community-post-link');
    if (!body || !pillLink) return;

    const text = (body.textContent || '').trim();
    const newMatch = text.match(/^I'd like to welcome and introduce\s+(.+?)\s+to the BANDtroductions family\. Great to have you\. Thank you!\s*🤘$/i);
    const oldMatch = text.match(/^👋\s*Welcome\s+(.+?)\s+—\s+thank you for joining our community!\s*🤘$/i);
    const match = newMatch || oldMatch;
    if (!match) return;

    const profileName = match[1].trim();
    const profileLink = document.createElement('a');
    profileLink.href = pillLink.href;
    profileLink.textContent = profileName;
    profileLink.className = 'community-welcome-profile-link';

    if (newMatch) {
      body.replaceChildren(
        document.createTextNode("I'd like to welcome and introduce "),
        profileLink,
        document.createTextNode(' to the BANDtroductions family. Great to have you. Thank you! 🤘')
      );
    } else {
      body.replaceChildren(
        document.createTextNode('👋 Welcome '),
        profileLink,
        document.createTextNode(' — thank you for joining our community! 🤘')
      );
    }

    pillLink.remove();
  });
}

const style = document.createElement('style');
style.textContent = '.community-welcome-profile-link{color:#0ccfbd;font-weight:800;text-decoration:underline;text-underline-offset:3px}';
document.head.appendChild(style);

enhanceWelcomePosts();

const feed = document.getElementById('feed');
if (feed) {
  new MutationObserver(enhanceWelcomePosts).observe(feed, {
    childList: true,
    subtree: true
  });
}
