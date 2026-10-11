let items=[],chosen,view='photo',checkoutBusy=false;
const $=id=>document.getElementById(id);
const formatPrice=p=>p?.unitPrice?new Intl.NumberFormat('en-US',{style:'currency',currency:p.unitPrice.currency}).format(p.unitPrice.amount):'Unavailable';
function render(){
 const s=items.find(s=>s.id===chosen);if(!s)return;
 $('main-preview').src=view==='original'?'/examples/class-photo.jpg':view==='product'?s.productImage:s.photo;
 $('main-preview').alt=view==='product'?`${s.name} scarf with a group photo`:view==='original'?'Original group photo':`${s.name} background combined with a group photo`;
 $('preview-caption').textContent=view==='product'?'An Arcade product preview of the group photo and selected background.':view==='original'?'The original, unedited group photo.':'The original photo is combined with an Arcade-generated background on this site.';
 $('design-name').textContent=s.name;$('design-description').textContent=s.description;$('product-price').textContent=formatPrice(s.product);$('save-image').href=s.photo;
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view));
 document.querySelectorAll('[data-design]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.design===chosen);b.querySelector('small').textContent=b.dataset.design===chosen?'Selected':'';});
 $('checkout-button').disabled=checkoutBusy||!s.product?.productId;$('checkout-button').textContent=checkoutBusy?'Preparing checkout…':'Continue to Arcade checkout →';
 $('checkout-button').hidden=false;$('checkout-link').hidden=true;$('checkout-status').textContent='';
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;render();}));
$('checkout-button').addEventListener('click',async()=>{
 if(checkoutBusy)return;const id=chosen;view='product';checkoutBusy=true;render();
 try{const storageKey=`ct-example-checkout-photo-${items.find(x=>x.id===id).product.productId}`;let requestId=sessionStorage.getItem(storageKey);if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(storageKey,requestId);}
 const r=await fetch('/api/example/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({designId:id,requestId})});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not prepare checkout.');
 if(chosen!==id)return;
 $('checkout-link').href=d.checkoutUrl;$('checkout-link').hidden=false;$('checkout-button').hidden=true;$('checkout-status').textContent='Check the product image before opening checkout.';
 }catch(e){$('checkout-status').textContent=e.message;}finally{checkoutBusy=false;$('checkout-button').disabled=false;$('checkout-button').textContent='Continue to Arcade checkout →';}
});
try{const r=await fetch('/examples/gallery.json');if(!r.ok)throw Error('Could not load designs');items=(await r.json()).items;chosen=items[0].id;
 $('design-options').replaceChildren(...items.map(s=>{const b=document.createElement('button');b.className='design-choice';b.dataset.design=s.id;b.setAttribute('aria-pressed','false');const img=document.createElement('img');img.src=s.photo;img.alt=s.name+' design example';const label=document.createElement('span');label.textContent=s.name;const note=document.createElement('small');b.append(img,label,note);b.addEventListener('click',()=>{chosen=s.id;render();});return b;}));render();
}catch{$('design-options').textContent='Could not load designs. Please reload the page.';}
