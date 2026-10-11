export function participantEmail(value){
 const email=typeof value==='string'?value.trim():'';
 if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw Object.assign(Error('有効なメールアドレスを入力してください。'),{status:400});
 return email;
}
