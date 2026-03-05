After each change, reinstall extension in VS Code so I need only to reload VS Code.

To reinstall, run:

```
cd /c/development/projects/diffus && npx @vscode/vsce package && "/c/Users/Rostislav/AppData/Local/Programs/Microsoft VS Code/bin/code.cmd" --install-extension diffus-0.1.0.vsix --force
```

This is mandatory after every code change — always do it before telling the user the change is ready.

Write tests after feature implementation
