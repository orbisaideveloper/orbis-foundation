import {createRequire} from 'node:module';
import {expect,it,vi} from 'vitest';
const require=createRequire(import.meta.url);
const {validateMayaRequest}=require('../ai/maya/MayaContract.cjs');
const {buildMayaMessages,generateMayaResult,namedChartFacts,chartReplyConsistent}=require('../ai/maya/MayaService.cjs');
const ids=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Rahu','Ketu'];
function body(){return {version:'maya.v1',capability:'astro.interpretation',language:'bn',input:{messages:[{role:'user',content:'আমার প্রথম ঘর খালি কেন?'}],chart:{utc:'1986-05-09T18:35:00.000Z',ascendant:291,ayanamsa:23.66,engine:'Astronomy Engine 2.1.19',method:'Lahiri J2000 anchor; IERS UTC/TT (1972+); whole-sign; true-frame mean nodes',timePolicy:'IERS test fixture',planets:ids.map((id,i)=>{const longitude=id==='Rahu'?5:id==='Ketu'?185:i*30+4;const sign=Math.floor(longitude/30);return {id,longitude,sign,degree:longitude%30,house:(sign-9+12)%12+1,retrograde:id==='Rahu'||id==='Ketu'};})}}};}
it('accepts complete consistent facts and rejects duplicate/inconsistent chart facts',()=>{
 expect(validateMayaRequest(body()).valid).toBe(true);
 for(const mutate of [v=>{v.input.chart.planets[0].house=1;},v=>{v.input.chart.planets[1].id='Sun';},v=>{v.input.chart.planets[0].degree=20;},v=>{v.input.chart.planets[8].longitude=186;},v=>{v.input.chart.name='private';}]){const v=body();mutate(v);expect(validateMayaRequest(v).valid).toBe(false);}
});
it('grounds discussion and leaves uncomputed timing explicit while using registry routing',async()=>{
 const request=body(),messages=buildMayaMessages(request);
 expect(messages[0].content).toContain('have NOT been computed');expect(messages[0].content).toContain('not a report generator');expect(messages[1].role).toBe('system');expect(messages[1].content).toContain('মকর');
 const manager={generateChat:vi.fn().mockResolvedValue({content:JSON.stringify({reply:'প্রশ্নের উত্তর'})})};
 expect(await generateMayaResult(manager,request)).toEqual({reply:'প্রশ্নের উত্তর'});
 expect(manager.generateChat.mock.calls[0][1]).toMatchObject({task:'reasoning',requirements:{capabilities:['chat','multilingual']}});
});

it('renders sign names, in-sign ascendant degree, rulers and occupants without asking the model to decode indices',()=>{
 const facts=namedChartFacts(body().input.chart,'bn');
 expect(facts.ascendant).toMatchObject({sign:'মকর',signEnglish:'Capricorn',degreeInSign:21});
 expect(facts.houses[0]).toMatchObject({house:1,sign:'মকর',ruler:'শনি',rulerHouse:10,occupants:[]});
});
it('rejects explicit contradictory chart positions, including the reported wrong first house',()=>{
 const chart=body().input.chart;
 for(const reply of ['আপনার লগ্ন কর্কট।','আপনার প্রথম ঘর কর্কট রাশিতে।','Your ascendant is Cancer.','আপনার সূর্য বৃষ রাশিতে।','आपका लग्न कर्क है।'])
  expect(chartReplyConsistent(reply,chart)).toBe(false);
 for(const reply of ['আপনার লগ্ন মকর। প্রথম ঘরে গ্রহ নেই।','Your ascendant is Capricorn.','আপনার সূর্য মেষ রাশিতে।','প্রথম ঘর খালি মানেই খারাপ নয়।'])
  expect(chartReplyConsistent(reply,chart)).toBe(true);
});
it('passes contradiction validation into provider fallback and rejects a bad final reply',async()=>{
 const request=body(),bad={content:JSON.stringify({reply:'আপনার লগ্ন কর্কট।'})};
 const manager={generateChat:vi.fn().mockResolvedValue(bad)};
 await expect(generateMayaResult(manager,request)).rejects.toThrow('MAYA_RESULT_INVALID');
 const validate=manager.generateChat.mock.calls[0][1].validateResponse;
 expect(validate(bad)).toBe(false);
 expect(validate({content:JSON.stringify({reply:'আপনার লগ্ন মকর।'})})).toBe(true);
});
