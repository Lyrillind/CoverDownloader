import requests
import json
import os
import sys

if len(sys.argv) > 1:
  pathToFolder = sys.argv[1]
else:
  pathToFolder = '.'

for root, dir, files in os.walk(pathToFolder):
  for file in files:
    r = requests.get('http://localhost:3000/search?keywords={}'.format(file))
    jsonData = r.text
    result = json.loads(jsonData)
    songs = result['result']['songs']
    print('{0}: {1}'.format(file, len(songs)))
