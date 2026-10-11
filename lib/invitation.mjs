import QRCode from 'qrcode';
export async function invitation(origin,roomId){
 const url=new URL('/student',origin);url.searchParams.set('room',roomId);
 return {url:url.href,qr:await QRCode.toDataURL(url.href,{width:320,margin:4,errorCorrectionLevel:'M',color:{dark:'#182c30',light:'#ffffff'}})};
}
