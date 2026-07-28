import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBYvp4LDFplzcTqlPK_OI8NovAHc1tS7NU",
  authDomain: "bandtroductions-dev.firebaseapp.com",
  projectId: "bandtroductions-dev",
  storageBucket: "bandtroductions-dev.firebasestorage.app",
  messagingSenderId: "793568967411",
  appId: "1:793568967411:web:713ba123948c11dfdfd586"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

/*
 * The original community composer requires text before its publish handler
 * runs. Media and link posts are valid on their own, so give that existing
 * handler an invisible content value only while it processes a media/link-only
 * post. This preserves the separate upload workflow and leaves the text box
 * visibly empty for the member.
 */
if (document.getElementById('publish-post')) {
  document.addEventListener('click', event => {
    const publishButton = event.target.closest?.('#publish-post');
    if (!publishButton) return;

    const contentInput = document.getElementById('post-content');
    if (!contentInput || contentInput.value.trim()) return;

    const linkValue = document.getElementById('post-link')?.value.trim() || '';
    const fileSelected = Boolean(document.getElementById('post-image')?.files?.length);
    const mediaPreview = Boolean(
      document.querySelector('#composer-fields img, #composer-fields video')
    );

    if (!linkValue && !fileSelected && !mediaPreview) return;

    contentInput.value = '\u200B';
    window.setTimeout(() => {
      if (contentInput.value === '\u200B') contentInput.value = '';
    }, 0);
  }, true);
}

export { app, auth, db, storage };
