import {createRequire} from 'node:module';
import {expect,it,vi} from 'vitest';
const require=createRequire(import.meta.url);
const bank=require('../ai/bengali/BengaliExamples.cjs');
const entries=require('../ai/bengali/examples.json');
it('groups equivalent variants and excludes pending examples',()=>{
 expect(bank.selectExamples([{role:'user',content:'ঠিক আছে তাহলে শুরু করে দাও'}]).map(e=>e.id)).toEqual(['start-discussed-work']);
 expect(bank.selectExamples([{role:'user',content:'বুঝতে পারলে?'}])[0].meaning).toContain('যাচাই');
 expect(bank.selectExamples([{role:'user',content:'ঠিক আছে করো'}],[{...entries[3],status:'candidate'}])).toEqual([]);
 expect(bank.exampleInstruction([{role:'user',content:'হ্যালো'}])).toBe('');
 expect(bank.exampleInstruction([{role:'user',content:'বুঝতে পারলে'}])).toContain('never factual evidence or execution authorization');
});
it('rejects duplicate normalized variants and exports approved rows only',()=>{
 expect(()=>bank.validateExamples([{...entries[0],variants:['একই কথা','একই কথা!']}])).toThrow('BANGLA_EXAMPLE_DUPLICATE');
 expect(bank.trainingRows([{...entries[0],status:'candidate'}])).toEqual([]);
 expect(bank.trainingRows()[0].messages.map(m=>m.role)).toEqual(['system','user','assistant']);
});
it('adds examples to Foundation provider fallback without inventing execution',async()=>{
 const {AIChatService}=require('../ai/AIChatService.cjs');
 const run=vi.fn().mockResolvedValue({content:'মূল কথা বুঝেছি'});
 const service=new AIChatService({agentLoop:{run}});
 const result=await service.executeProviderFallback([{role:'user',content:'বুঝতে পারলে'}],null,'বুঝতে পারলে');
 expect(run.mock.calls[0][0].some(m=>m.content.includes('Reviewed Bengali language examples'))).toBe(true);
 expect(result.message.content).toBe('মূল কথা বুঝেছি');
});
