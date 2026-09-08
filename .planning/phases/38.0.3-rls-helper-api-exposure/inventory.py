import io, os, re, json, glob

MIG = sorted(glob.glob('supabase/migrations/*.sql'))

# Capture every CREATE [OR REPLACE] FUNCTION public.<name>(...) ... AS $tag$ ... $tag$
CREATE = re.compile(
    r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?\s*\(',
    re.I)

def dollar_body(text, start):
    """From `start`, find `AS $tag$ ... $tag$` and return (header, body, end_index)."""
    m = re.search(r'\bAS\s+(\$[A-Za-z_]*\$)', text[start:start+6000])
    if not m:
        return None, None, None
    tag = m.group(1)
    body_start = start + m.end()
    close = text.find(tag, body_start)
    if close == -1:
        return None, None, None
    return text[start:start+m.start()], text[body_start:close], close + len(tag)

defs = {}          # name -> latest record
grants = {}        # name -> list of (migration, statement)

for path in MIG:
    mig = os.path.basename(path)
    src = io.open(path, encoding='utf-8', errors='replace').read()

    # strip line comments for scanning (keep original for body analysis)
    for m in CREATE.finditer(src):
        name = m.group(1)
        header, body, endix = dollar_body(src, m.start())
        # Modifiers may follow the body: `$$ LANGUAGE plpgsql SECURITY DEFINER
        # SET search_path = public;` -- migration 046's shape. Missing this
        # excluded every such function from the inventory entirely.
        trailer = src[endix:endix+300].split(';')[0] if endix else ''
        if body is None:
            # SQL-language one-liners sometimes lack $$; take a rough slice
            header = src[m.start():m.start()+1200]
            body = header
        blob = (header or '') + '\n' + (body or '')
        code = '\n'.join(l.split('--')[0] for l in blob.split('\n'))

        argm = re.search(r'\(([^)]*)\)', header or '', re.S)
        args = ' '.join((argm.group(1) if argm else '').split())

        modifiers = (header or '') + ' ' + trailer
        sp = re.search(r"SET\s+search_path\s*=\s*([^\s;]+)", modifiers, re.I)
        defs[name] = {
            'migration': mig,
            'name': name,
            'args': args[:120],
            'definer': bool(re.search(r'SECURITY\s+DEFINER', modifiers, re.I)),
            'search_path': (sp.group(1) if sp else '(none)'),
            'returns_trigger': bool(re.search(r'RETURNS\s+trigger', (header or '')+' '+trailer, re.I)),
            'binds_auth_uid': bool(re.search(r'auth\.uid\(\)', code)),
            'writes': bool(re.search(r'^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b', code, re.M)),
            'uid_param': bool(re.search(r'\b(p_uid|p_user_id|uid|p_viewer|p_actor_id|p_actor_user_id|a uuid|b uuid)\b', args, re.I)),
        }

    # Strip line comments FIRST. Without this the regex matches the word
    # "grant" inside a comment such as "-- Migration 123's grant posture" and
    # runs forward to the next real ON FUNCTION, capturing a REVOKE whose text
    # begins with prose -- which then fails startswith('REVOKE') and is filed
    # as a GRANT, reporting the roles in its FROM clause as GRANTED. That
    # inverted the posture for every hardened Phase 38 RPC.
    nocomment = '\n'.join(l.split('--')[0] for l in src.split('\n'))
    for m in re.finditer(r'(?:^|;)\s*(REVOKE|GRANT)\s+[^;]*?\bON\s+FUNCTION\s+(?:public\.)?"?(\w+)"?[^;]*;',
                         nocomment, re.I|re.S|re.M):
        stmt = ' '.join(m.group(0).lstrip(';').split())
        assert stmt.upper().startswith(('REVOKE','GRANT')), stmt[:80]
        grants.setdefault(m.group(2), []).append((mig, stmt[:250]))

for n, r in defs.items():
    r['grant_stmts'] = grants.get(n, [])

io.open('/private/tmp/claude-501/-Users-peterzora-Desktop-funun/920e4b1a-ce58-493f-b50a-87efac1029fd/scratchpad/inventory.json','w').write(json.dumps(defs, indent=1))

definers = {n:r for n,r in defs.items() if r['definer'] and not r['returns_trigger']}
print('functions parsed          :', len(defs))
print('SECURITY DEFINER (non-trg):', len(definers))
print('  writes                  :', sum(1 for r in definers.values() if r['writes']))
print('  binds auth.uid()        :', sum(1 for r in definers.values() if r['binds_auth_uid']))
print('  takes a uid-ish param   :', sum(1 for r in definers.values() if r['uid_param']))
print("  search_path = ''        :", sum(1 for r in definers.values() if r['search_path'] in ("''",)))
print('  search_path = public    :', sum(1 for r in definers.values() if r['search_path'].lower()=='public'))
print('  search_path missing     :', sum(1 for r in definers.values() if r['search_path']=='(none)'))
print('  has explicit REVOKE stmt:', sum(1 for r in definers.values() if any('REVOKE' in s.upper() for _,s in r['grant_stmts'])))
