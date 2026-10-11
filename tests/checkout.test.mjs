import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkoutUrl,exampleCheckoutInput} from '../lib/checkout.mjs';
test('checkout only accepts a listed product, fixes quantity and preserves retry identity',()=>{
 const requestId='aa94537d-0d02-4a74-a257-a346a9351d2e';const gallery={items:[{id:'cats',includesPhoto:true,product:{productId:'actual-product'}}]};
 assert.deepEqual(exampleCheckoutInput({designId:'cats',requestId,productId:'injected',quantity:100},gallery),{requestId,dropShip:true,lines:[{productId:'actual-product',quantity:1}]});
 assert.throws(()=>exampleCheckoutInput({designId:'missing',requestId},gallery));assert.throws(()=>exampleCheckoutInput({designId:'cats',requestId},{items:[{id:'cats',product:{productId:'background-only'}}]}));assert.throws(()=>exampleCheckoutInput({designId:'cats',requestId:'bad'},gallery));
 assert.equal(checkoutUrl({checkoutUrl:'https://checkout.arcade.ai/checkouts/123'}).checkoutUrl,'https://checkout.arcade.ai/checkouts/123');
 for(const url of ['http://checkout.arcade.ai/','https://user:password@example.com/','javascript:alert(1)'])assert.throws(()=>checkoutUrl({checkoutUrl:url}));
});
