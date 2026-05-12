import json
import subprocess

app_token = '99vxSbOldLniKUjnGh9NAI98CLAtedgdYeHJ7UgF'
user_token = '0hhRFT0L7AXOYgWYxY4MglSqdDtMLLPUJsatR6ZV'

init = subprocess.check_output([
    'curl.exe', '-sk',
    '-H', f'App-Token: {app_token}',
    '-H', f'Authorization: user_token {user_token}',
    'https://192.168.10.9/glpi/apirest.php/initSession'
])

session = json.loads(init.decode())['session_token']
print('session', session)

computers_raw = subprocess.check_output([
    'curl.exe', '-sk',
    '-H', f'App-Token: {app_token}',
    '-H', f'Session-Token: {session}',
    'https://192.168.10.9/glpi/apirest.php/Computer?range=0-999&expand_dropdowns=true&is_deleted=false'
])
computers = json.loads(computers_raw.decode())
print('count', len(computers))
print('unique ids', len({c['id'] for c in computers}))
print('first 10 fields')
for c in computers[:10]:
    print({k: c.get(k) for k in ['id', 'name', 'states_id', 'is_deleted', 'states', '_states', 'locations_id']})
print('state values')
states = {}
for c in computers:
    key = json.dumps(c.get('states_id'))
    states[key] = states.get(key, 0) + 1
print(states)
