export async function requestEmailCode(auth,email,origin) {
  const {error}=await auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:`${origin}/account`}});
  if(error)throw error;
}
export async function verifyEmailCode(auth,email,code) {
  const token=code.replace(/\s/g,'');
  if(!/^\d{6,10}$/.test(token))throw new Error('Enter the numeric sign-in code from your latest email.');
  const {error}=await auth.verifyOtp({email:email.trim(),token,type:'email'});
  if(error)throw new Error('That code is invalid or has expired. Check your latest email or request a new code.');
}
