const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file){const mod={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports,mod);return mod.exports}
const {isResultVoiceText}=load('lib/result-voice-request.ts');
const {safetyResultSpeech}=load('lib/safety-result-speech.ts');
for(const family of ['민준','샘플','샘플님'])for(const responder of ['김선생님','박친구']){
 const lines=safetyResultSpeech({phase:'done',result:'confirmed',evidence:[{direct:true,name:responder,source:'teacher',state:'safe',at:Date.parse('2026-10-08T05:07:00Z'),quote:`${family}님과 지금 함께 있어요. 직접 확인했어요.`}]},{family:{id:'self',name:family}});
 assert(isResultVoiceText(lines[0]),lines[0]);assert(isResultVoiceText(lines[1]),lines[1]);
}
for(const text of ['임의의 통화 녹음 내용','전화번호 010-1234-5678','<speak>임의 SSML</speak>','01012345678님의 안전 확인 답이 도착했어요.','김친구님께서 오후 25시 7분에 본인이 안전하다고 응답했어요. 저는 괜찮아요. 돈을 부탁하지 않았어요.'])assert(!isResultVoiceText(text),text);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'lib/voice-assets.json'),'utf8'));
for(const [text,file]of Object.entries(manifest)){assert(/^\/audio\/guide\/[a-f0-9]{20}\.mp3$/.test(file),file);assert(fs.statSync(path.join(root,'public',file)).size>100,text)}
for(const text of ['기관 확인 결과를 알려드릴게요.','민준님의 안전 확인 답이 도착했어요.','김선생님께서','오전','오후',...Array.from({length:12},(_,i)=>`${i+1}시`),...Array.from({length:60},(_,i)=>`${i}분에`)])assert(manifest[text],text);
assert(!fs.readFileSync(path.join(root,'lib/speech-out.ts'),'utf8').includes('speechSynthesis'));
console.log('PASS safe result templates, honorific names, rejection of arbitrary/private text, all voice assets, clock coverage, no installed-voice dependency in call-demo');
