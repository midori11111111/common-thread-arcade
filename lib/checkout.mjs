export function checkoutUrl(data){
 let url;try{url=new URL(data.checkoutUrl);}catch{throw Object.assign(Error('Arcadeから購入ページを取得できませんでした。'),{status:502});}
 if(url.protocol!=='https:'||url.username||url.password)throw Object.assign(Error('購入ページのURLを確認できませんでした。'),{status:502});
 return {checkoutId:data.checkoutId,checkoutUrl:url.href};
}
export function exampleCheckoutInput(body,gallery){
 const item=gallery.items.find(x=>x.id===body.designId);
 if(!item?.product?.productId||item.includesPhoto!==true)throw Object.assign(Error('注文できる柄を選んでください。'),{status:400});
 if(typeof body.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId))throw Object.assign(Error('購入ページのリクエストIDが正しくありません。'),{status:400});
 return {requestId:body.requestId,dropShip:true,lines:[{productId:item.product.productId,quantity:1}]};
}
