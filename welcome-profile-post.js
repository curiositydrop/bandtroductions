import { auth, db } from './firebase-dev.js';
import { doc, serverTimestamp, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

export async function createWelcomePost({profileId,displayName,accountType='member'}){
  if(!profileId||!displayName)return false;
  const postId=`welcome_${profileId}`;
  try{
    const writerId=auth.currentUser?.uid||profileId;
    await setDoc(doc(db,'posts',postId),{
      authorId:writerId,
      authorName:'BANDtroductions Admin',
      accountType:'fan',
      category:'general',
      content:`👋 Welcome ${displayName} — thank you for joining our community! 🤘`,
      linkUrl:`profile.html?id=${encodeURIComponent(profileId)}`,
      imageUrl:'',
      welcomedProfileId:profileId,
      welcomedAccountType:accountType,
      systemPost:true,
      published:true,
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
    await updateDoc(doc(db,'profiles',profileId),{welcomePostCreated:true,welcomePostCreatedAt:serverTimestamp()}).catch(()=>{});
    return true;
  }catch(error){
    console.warn('Welcome post could not be created:',error);
    return false;
  }
}
