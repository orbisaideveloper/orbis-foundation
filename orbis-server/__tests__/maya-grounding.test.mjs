import {createRequire} from 'node:module';
import {expect,it} from 'vitest';
const require=createRequire(import.meta.url);
const {buildMayaMessages,namedChartFacts,chartReplyConsistent}=require('../ai/maya/MayaService.cjs');
const ids=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Rahu','Ketu'];
const signs=[0,1,0,1,8,10,7,0,6];
const chart={ascendant:291,planets:ids.map((id,i)=>({id,sign:signs[i],degree:5,house:(signs[i]-9+12)%12+1,retrograde:id==='Saturn'}))};
it('supplies correct third-house topics and separates rulership from actual placement',()=>{
 const third=namedChartFacts(chart,'bn').houses[2];
 expect(third).toMatchObject({house:3,sign:'মীন',ruler:'বৃহস্পতি',rulerSign:'কুম্ভ',rulerHouse:2,occupants:[]});
 expect(third.traditionalTopics).toContain('communication');
 expect(third.traditionalTopics).not.toContain('marriage');
});
it('uses the current saved chart and user follow-ups without replaying incorrect assistant claims',()=>{
 const messages=buildMayaMessages({capability:'astro.interpretation',language:'bn',input:{chart,messages:[{role:'user',content:'তিন নম্বর ঘর বোঝাও'},{role:'assistant',content:'আবার জন্মতারিখ দিন'},{role:'user',content:'প্রোফাইলে তো আছে'}]}});
 expect(messages[0].content).toContain('CHART_PRESENT');
 expect(messages[0].content).toContain('Do NOT ask again');
 expect(messages[0].content).toContain('Answer NOW');
 expect(messages.filter(m=>m.role==='assistant')).toHaveLength(0);
 expect(messages.at(-1).content).toBe('প্রোফাইলে তো আছে');
 expect(messages[1].content).toContain('traditionalTopics');
});

it.each([
 ['Moon rules Cancer.',true],
 ['Moon is the ruler of Cancer.',true],
 ['চন্দ্র কর্কটের অধিপতি।',true],
 ['चंद्र कर्क का स्वामी है।',true],
 ['Sun is not in Taurus.',true],
 ['সূর্য বৃষে নেই।',true],
 ['सूर्य वृषभ में नहीं है।',true],
 ['Sun is not in Aries.',false],
 ['Moon is in Cancer.',false],
 ['চন্দ্র কর্কটে অবস্থিত।',false],
 ['Moon rules Cancer, located in Cancer.',false],
 ['Moon rules Cancer, located in Taurus.',true],
 ['Sunday is associated with Cancer.',true],
])('distinguishes chart location from rulership and negation: %s',(reply,expected)=>{
 expect(chartReplyConsistent(reply,chart)).toBe(expected);
});
