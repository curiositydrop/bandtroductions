import { auth, db } from './firebase-dev.js';
import { createWelcomePost } from './welcome-profile-post.js?v=1';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

let ran=false;

async function currentUserIsAdmin(user){
  try{
    const direct=await getDoc(doc(db,'profiles',user.uid));
    if(direct.exists()&&direct.data()?.isAdmin===true)return true;
    const admins=await getDocs(query(collection(db,'profiles'),where('isAdmin','==',true)));
    return admins.docs.some(d=>d.id===user.uid||d.data()?.ownerId===user.uid);
  }catch(error){
    console.warn('Onboarding repair could not confirm admin access.',error);
    return false;
  }
}

async function repairIncompleteAccounts(){
  if(ran)return;
  const user=auth.currentUser;
  if(!user||!(await currentUserIsAdmin(user)))return;
  ran=true;

  try{
    const users=await getDocs(collection(db,'users'));
    for(const userDoc of users.docs){
      const data=userDoc.data()||{};
      const uid=userDoc.id;
      const displayName=String(data.displayName||'').trim();
      const accountType=String(data.accountType||'fan').toLowerCase();
      if(!uid||!displayName||data.profileComplete===true)continue;

      const profileRef=doc(db,'profiles',uid);
      const profileSnap=await getDoc(profileRef);
      if(!profileSnap.exists()){
        await setDoc(profileRef,{
          ownerId:uid,
          accountType,
          displayName,
          bio:'Profile setup in progress.',
          published:true,
          approvalStatus:'approved',
          onboardingPlaceholder:true,
          createdAt:data.createdAt||serverTimestamp(),
          updatedAt:serverTimestamp()
        },{merge:true});
      }

      const currentProfile=(await getDoc(profileRef)).data()||{};
      if(!currentProfile.welcomePostCreated){
        await createWelcomePost({profileId:uid,displayName,accountType});
      }
    }
  }catch(error){
    console.warn('Incomplete account backfill could not finish.',error);
  }
}

onAuthStateChanged(auth,()=>{repairIncompleteAccounts();});
