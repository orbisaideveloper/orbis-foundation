import {createRequire} from 'node:module';
import {expect,it} from 'vitest';
const require=createRequire(import.meta.url);
const {buildMayaMessages}=require('../ai/maya/MayaService.cjs');
it('requires readable explanations and uncertainty for each claim without replacing chart facts',()=>{
 const ids=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Rahu','Ketu'];
 const request={capability:'astro.interpretation',language:'bn',input:{messages:[{role:'user',content:'পাঁচ নম্বর ঘর বুঝিয়ে বলো'}],chart:{ascendant:291,planets:ids.map((id,index)=>({id,sign:index,degree:1.25,house:index+1,retrograde:false}))}}};
 const messages=buildMayaMessages(request);
 expect(messages[0].content).toContain('short paragraphs separated by blank lines');
 expect(messages[0].content).toContain('EACH interpretive claim');
 expect(messages[0].content).toContain('not a computed total planetary-strength score');
 expect(messages[1].content).toContain('degreeInSign');
 expect(messages.at(-1).content).toBe('পাঁচ নম্বর ঘর বুঝিয়ে বলো');
});
