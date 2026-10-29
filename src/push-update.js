export const pushWorkerURL='/sw.js?v=0.21.3';
export async function updatePushWorker(){
 if(!('serviceWorker' in navigator))return;
 const old=await navigator.serviceWorker.getRegistration('/');
 if(!old)return;
 const registration=await navigator.serviceWorker.register(pushWorkerURL,{scope:'/',updateViaCache:'none'});
 await registration.update();
 if(registration.installing&&registration.installing.state!=='activated'){const worker=registration.installing;await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Mise à jour en cours. Rouvrez les préférences dans un instant.')),15000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timeout);resolve()}else if(worker.state==='redundant'){clearTimeout(timeout);reject(Error('Réessayez la mise à jour.'))}})})}
 return registration;
}
