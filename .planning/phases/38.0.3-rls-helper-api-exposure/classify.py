import io, json, re, subprocess, collections

d = json.load(open('/private/tmp/claude-501/-Users-peterzora-Desktop-funun/920e4b1a-ce58-493f-b50a-87efac1029fd/scratchpad/inventory.json'))
defs = {n: r for n, r in d.items() if r['definer'] and not r['returns_trigger']}

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

# ---- app call sites, with client type -------------------------------------
rpc_hits = sh("grep -rn \"\\.rpc('\" app/ lib/ components/ --include=*.ts --include=*.tsx 2>/dev/null")
callsites = collections.defaultdict(list)
for line in rpc_hits.split('\n'):
    m = re.search(r"^([^:]+):(\d+):.*?(\w+)\.rpc\('(\w+)'", line)
    if m:
        callsites[m.group(4)].append((m.group(1), m.group(2), m.group(3)))

# ---- policy / migration reference counts ----------------------------------
refcount = {}
for n in defs:
    out = sh(f"grep -rho 'public\\.{n}(' supabase/migrations/*.sql 2>/dev/null | wc -l")
    refcount[n] = int(out.strip() or 0)

# ---- stated grant posture from the repo -----------------------------------
def posture(r):
    rev = [s for _, s in r['grant_stmts'] if s.upper().startswith('REVOKE')]
    gra = [s for _, s in r['grant_stmts'] if s.upper().startswith('GRANT')]
    names_roles = any(re.search(r'\banon\b|\bauthenticated\b', s, re.I) for s in rev)
    grants_to = set()
    for s in gra:
        for role in ('service_role', 'authenticated', 'anon', 'postgres'):
            if re.search(r'\b' + role + r'\b', s, re.I):
                grants_to.add(role)
    return names_roles, grants_to

rows = []
for n, r in defs.items():
    names_roles, grants_to = posture(r)
    sites = callsites.get(n, [])
    user_scoped = [s for s in sites if s[2] not in ('service', 'admin', 'svc')]
    if grants_to and grants_to <= {'service_role', 'postgres'} and names_roles:
        cls, why = 'D', 'service-role only; already unreachable'
    elif r['binds_auth_uid'] and names_roles:
        cls, why = 'C', 'binds auth.uid() + names anon/authenticated'
    elif user_scoped:
        cls, why = 'B', f'called with a USER-SCOPED client ({len(user_scoped)} site/s) — bind, do not relocate'
    elif r['uid_param'] and not r['binds_auth_uid']:
        cls, why = 'A', 'uid param, never binds auth.uid(), no user-scoped call site'
    else:
        cls, why = 'REVIEW', 'needs reading'
    rows.append(dict(cls=cls, name=n, why=why, mig=r['migration'], writes=r['writes'],
                     binds=r['binds_auth_uid'], uidp=r['uid_param'], sp=r['search_path'],
                     names_roles=names_roles, grants=sorted(grants_to) or ['(none stated)'],
                     refs=refcount[n], sites=sites))

order = {'B': 0, 'A': 1, 'REVIEW': 2, 'C': 3, 'D': 4}
rows.sort(key=lambda x: (order[x['cls']], -x['refs'], x['name']))
json.dump(rows, open('/private/tmp/claude-501/-Users-peterzora-Desktop-funun/920e4b1a-ce58-493f-b50a-87efac1029fd/scratchpad/classified.json','w'), indent=1)

c = collections.Counter(r['cls'] for r in rows)
print('CLASSIFICATION of %d SECURITY DEFINER functions (non-trigger, public)\n' % len(rows))
for k in ('B','A','REVIEW','C','D'):
    print('  %-7s %3d' % (k, c[k]))
print()
print('  writing definers        :', sum(1 for r in rows if r['writes']))
print('  no explicit anon/auth revoke in repo:', sum(1 for r in rows if not r['names_roles']))
