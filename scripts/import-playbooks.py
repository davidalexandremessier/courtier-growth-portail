"""Build private server-only retrieval data from locally approved playbooks."""
import pathlib,json,re,hashlib,argparse
parser=argparse.ArgumentParser();parser.add_argument("--version",default="2026-10-16");args=parser.parse_args()
root=pathlib.Path('knowledge/playbooks')/args.version/'textes';docs=[];chunks=[]
if not root.is_dir():raise SystemExit('Version documentaire introuvable')
for path in sorted(root.glob('*.txt')):
 if 'Troubleshooting' in path.name and 'PDF' not in path.name and any(root.glob('*Troubleshooting*PDF*.txt')):continue
 text=path.read_text(errors='replace').replace('\x00','')
 lines=[re.sub(r'\s+',' ',line).strip() for line in text.splitlines() if line.strip()]
 if not lines:continue
 docid=hashlib.sha256(path.name.encode()).hexdigest()[:12]
 title=re.sub(r'\.txt$','',path.name);docs.append({'id':docid,'title':title,'imported':args.version,'sha256':hashlib.sha256(text.encode()).hexdigest()})
 start=0
 while start<len(lines):
  end=start+1;body=lines[start]
  while end<len(lines) and len(body)+len(lines[end])<2000:body+='\n'+lines[end];end+=1
  # Split a very long paragraph rather than truncate it silently.
  for offset in range(0,len(body),1800):
   excerpt=body[offset:offset+2000];cid=hashlib.sha256((docid+str(start)+str(offset)+excerpt).encode()).hexdigest()[:16]
   chunks.append({'id':cid,'document_id':docid,'title':title,'paragraph_start':start+1,'paragraph_end':end,'text':excerpt})
  start=end
pathlib.Path('server/playbook-index.json').write_text(json.dumps({'documents':docs,'chunks':chunks},ensure_ascii=False))
print(json.dumps({'documents':len(docs),'passages':len(chunks)}))
