import { db } from './firebase-dev.js';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

let adminIdentityPromise=null;
async function getAdminIdentity(){
  if(adminIdentityPromise)return adminIdentityPromise;
  adminIdentityPromise=(async()=>{
    try{
      const snap=await getDocs(query(collection(db,'profiles'),where('isAdmin','==',true)));
      if(!snap.empty){
        const picked=snap.docs[0];
        const data=picked.data()||{};
        return {id:picked.id,name:data.displayName||'BANDtroductions Admin'};
      }
    }catch(error){console.warn('Could not resolve admin identity for welcome post:',error);}
    return {id:'',name:'BANDtroductions Admin'};
  })();
  return adminIdentityPromise;
}

export async function createWelcomePost({profileId,displayName,accountType='member'}){
  if(!profileId||!displayName)return false;
  const postId=`welcome_${profileId}`;
  try{
    const admin=await getAdminIdentity();
    await setDoc(doc(db,'posts',postId),{
      authorId:admin.id,
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
