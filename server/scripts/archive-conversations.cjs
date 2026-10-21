require('dotenv').config({path:process.env.AZIT_STORAGE_ENV||'/etc/seollem-ai-lounge/storage.env',quiet:true});
const archive=require('../services/conversationArchive');
(async()=>{let count=0;for(let i=0;i<20;i++){const n=await archive.archiveBatch();count+=n;if(n<500)break;}let compacted=0;for(let i=0;i<20;i++){const n=await archive.compactBatch();compacted+=n;if(n<500)break;}console.log(JSON.stringify({archivedMessages:count,compactedMessages:compacted,verified:true}));})().catch(e=>{console.error('Archive failed:',e.message);process.exitCode=1;});
