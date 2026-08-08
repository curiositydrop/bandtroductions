import { auth, db } from './firebase-dev.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

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

async function repairOne({uid,displayName,accountType='fan'},adminUser){
  if(!uid||!displayName)return false;
  const profileRef=doc(db,'profiles',uid);
  const existing=await getDoc(profileRef);
  const existingData=existing.exists()?existing.data():{};

  if(!existing.exists()){
    await setDoc(profileRef,{
      ownerId:uid,
      accountType:String(accountType||'fan').toLowerCase(),
      displayName:String(displayName).trim(),
      bio:'Profile setup in progress.',
      published:true,
      approvalStatus:'approved',
      onboardingPlaceholder:true,
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    },{merge:true});
  }else if(existingData.published!==true){
    await setDoc(profileRef,{published:true,approvalStatus:'approved',updatedAt:serverTimestamp()},{merge:true});
  }

  const refreshed=(await getDoc(profileRef)).data()||{};
  if(!refreshed.welcomePostCreated){
    const postId=`welcome_${uid}`;
    await setDoc(doc(db,'posts',postId),{
      authorId:adminUser.uid,
      authorName:'BANDtroductions Admin',
      accountType:'fan',
      category:'general',
      content:`👋 Welcome ${displayName} — thank you for joining our community! 🤘`,
      linkUrl:`profile.html?id=${encodeURIComponent(uid)}`,
      imageUrl:'',
      welcomedProfileId:uid,
      welcomedAccountType:String(accountType||'fan').toLowerCase(),
      systemPost:true,
      published:true,
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    },{merge:true});
    await updateDoc(profileRef,{welcomePostCreated:true,welcomePostCreatedAt:serverTimestamp()});
  }
  return true;
}

async function repairIncompleteAccounts(){
  if(ran)return;
  const user=auth.currentUser;
  if(!user||!(await currentUserIsAdmin(user)))return;
  ran=true;

  try{
    // One-time recovery for the account that registered successfully but never
    // received a public profile/welcome post because the broad users scan was blocked.
    await repairOne({
      uid:'zntkCaePbofPiR6A5fTKYCULe3G3',
      displayName:'Eye’s Upon',
      accountType:'band'
    },user);

    // Keep the general repair for any other incomplete accounts when rules allow it.
    try{
      const users=await getDocs(collection(db,'users'));
      for(const userDoc of users.docs){
        const data=userDoc.data()||{};
        const uid=userDoc.id;
        const displayName=String(data.displayName||'').trim();
        const accountType=String(data.accountType||'fan').toLowerCase();
        if(!uid||!displayName||data.profileComplete===true)continue;
        await repairOne({uid,displayName,accountType},user);
      }
    }catch(scanError){
      console.warn('Broad incomplete-account scan unavailable; targeted repair still ran.',scanError);
    }
  }catch(error){
    console.warn('Incomplete account repair could not finish.',error);
  }
}

onAuthStateChanged(auth,()=>{repairIncompleteAccounts();});
