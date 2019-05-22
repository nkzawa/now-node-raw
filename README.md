# now-node-raw

Set up your `now.json` like:

```json
{
  "builds": [
    {
      "src": "foo/index.js",
      "use": "@nkzawa/now-node-raw",
      "config": {
        "includeFiles": [
          "node_modules/bar/**"
        ],
        "maxLambdaSize": "50mb",
        "runtime": "nodejs10.x"
      }
    }
  ]
}
```
