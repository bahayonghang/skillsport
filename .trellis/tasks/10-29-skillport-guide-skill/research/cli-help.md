# skillport-cli --help capture

Captured from the locked release build (`npm run build:cli`) on dev. Version: `skillport-cli 1.1.1`.

## `skillport-cli --help`

```text
Manage Local SkillPort skills

Usage: skillport-cli.exe [OPTIONS] <COMMAND>

Commands:
  skills    
  agents    
  projects  
  tags      
  notes     
  help      Print this message or the help of the given subcommand(s)

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
  -V, --version      Print version
```

## `skillport-cli skills --help`

```text
Usage: skillport-cli.exe skills [OPTIONS] <COMMAND>

Commands:
  list     
  show     
  search   
  install  
  import   
  sync     
  unlink   
  help     Print this message or the help of the given subcommand(s)

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli skills list --help`

```text
Usage: skillport-cli.exe skills list [OPTIONS]

Options:
      --json             
      --tag <TAGS>       
      --agent <AGENT>    
      --lang <LANG>      [default: en] [possible values: en, zh]
      --source <SOURCE>  
  -h, --help             Print help
```

## `skillport-cli skills show --help`

```text
Usage: skillport-cli.exe skills show [OPTIONS] <REFERENCE>

Arguments:
  <REFERENCE>  

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli skills search --help`

```text
Usage: skillport-cli.exe skills search [OPTIONS] <QUERY>

Arguments:
  <QUERY>  

Options:
      --json           
      --limit <LIMIT>  
      --lang <LANG>    [default: en] [possible values: en, zh]
  -h, --help           Print help
```

## `skillport-cli skills install --help`

```text
Usage: skillport-cli.exe skills install [OPTIONS] <SOURCE>

Arguments:
  <SOURCE>  

Options:
      --json             
      --replace          
      --lang <LANG>      [default: en] [possible values: en, zh]
      --yes              
      --sync             
      --agent <AGENTS>   
      --method <METHOD>  [default: auto]
  -h, --help             Print help
```

## `skillport-cli skills import --help`

```text
Usage: skillport-cli.exe skills import [OPTIONS] <--from-zip <FILE>|--from-dir <DIR>>

Options:
      --from-zip <FILE>  Local `.zip` skill archive
      --json             
      --from-dir <DIR>   Local directory that contains SKILL.md
      --lang <LANG>      [default: en] [possible values: en, zh]
      --replace          
      --yes              
      --sync             
      --agent <AGENTS>   
      --method <METHOD>  [default: auto]
      --dry-run          
  -h, --help             Print help
```

## `skillport-cli skills sync --help`

```text
Usage: skillport-cli.exe skills sync [OPTIONS] [REFERENCES]...

Arguments:
  [REFERENCES]...  

Options:
      --all              
      --json             
      --agent <AGENTS>   
      --lang <LANG>      [default: en] [possible values: en, zh]
      --method <METHOD>  [default: auto]
      --dry-run          
  -h, --help             Print help
```

## `skillport-cli skills unlink --help`

```text
Usage: skillport-cli.exe skills unlink [OPTIONS] --agent <AGENT> <REFERENCES>...

Arguments:
  <REFERENCES>...  

Options:
      --agent <AGENT>  
      --json           
      --dry-run        
      --lang <LANG>    [default: en] [possible values: en, zh]
      --yes            
  -h, --help           Print help
```

## `skillport-cli agents --help`

```text
Usage: skillport-cli.exe agents [OPTIONS] <COMMAND>

Commands:
  list  
  help  Print this message or the help of the given subcommand(s)

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli agents list --help`

```text
Usage: skillport-cli.exe agents list [OPTIONS]

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli projects --help`

```text
Usage: skillport-cli.exe projects [OPTIONS] <COMMAND>

Commands:
  list       
  skills     
  add        
  install    
  uninstall  
  help       Print this message or the help of the given subcommand(s)

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli projects list --help`

```text
Usage: skillport-cli.exe projects list [OPTIONS]

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli projects skills --help`

```text
Usage: skillport-cli.exe projects skills [OPTIONS] <PROJECT>

Arguments:
  <PROJECT>  

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli projects add --help`

```text
Usage: skillport-cli.exe projects add [OPTIONS] [PATH]

Arguments:
  [PATH]  Project directory; defaults to the current directory

Options:
      --dry-run      
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli projects install --help`

```text
Usage: skillport-cli.exe projects install [OPTIONS] --agent <AGENT> <PROJECT> <REFERENCES>...

Arguments:
  <PROJECT>        
  <REFERENCES>...  

Options:
      --agent <AGENT>    
      --json             
      --lang <LANG>      [default: en] [possible values: en, zh]
      --method <METHOD>  [default: auto]
      --dry-run          
      --yes              
  -h, --help             Print help
```

## `skillport-cli projects uninstall --help`

```text
Usage: skillport-cli.exe projects uninstall [OPTIONS] --agent <AGENT> <PROJECT> <REFERENCES>...

Arguments:
  <PROJECT>        
  <REFERENCES>...  

Options:
      --agent <AGENT>  
      --json           
      --dry-run        
      --lang <LANG>    [default: en] [possible values: en, zh]
      --yes            
  -h, --help           Print help
```

## `skillport-cli tags --help`

```text
Usage: skillport-cli.exe tags [OPTIONS] <COMMAND>

Commands:
  list    
  create  
  add     
  remove  
  help    Print this message or the help of the given subcommand(s)

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli tags list --help`

```text
Usage: skillport-cli.exe tags list [OPTIONS]

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli tags create --help`

```text
Usage: skillport-cli.exe tags create [OPTIONS] <NAME>

Arguments:
  <NAME>  

Options:
      --group <GROUP>              
      --json                       
      --color <COLOR>              
      --lang <LANG>                [default: en] [possible values: en, zh]
      --description <DESCRIPTION>  
      --dry-run                    
  -h, --help                       Print help
```

## `skillport-cli tags add --help`

```text
Usage: skillport-cli.exe tags add [OPTIONS] --tag <TAGS> <REFERENCES>...

Arguments:
  <REFERENCES>...  

Options:
      --json                     
      --tag <TAGS>               
      --lang <LANG>              [default: en] [possible values: en, zh]
      --reason <REASON>          
      --confidence <CONFIDENCE>  
      --review                   
      --dry-run                  
      --yes                      
  -h, --help                     Print help
```

## `skillport-cli tags remove --help`

```text
Usage: skillport-cli.exe tags remove [OPTIONS] --tag <TAGS> <REFERENCE>

Arguments:
  <REFERENCE>  

Options:
      --json         
      --tag <TAGS>   
      --dry-run      
      --lang <LANG>  [default: en] [possible values: en, zh]
      --yes          
  -h, --help         Print help
```

## `skillport-cli notes --help`

```text
Usage: skillport-cli.exe notes [OPTIONS] <COMMAND>

Commands:
  get   
  set   
  help  Print this message or the help of the given subcommand(s)

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli notes get --help`

```text
Usage: skillport-cli.exe notes get [OPTIONS] <REFERENCE>

Arguments:
  <REFERENCE>  

Options:
      --json         
      --lang <LANG>  [default: en] [possible values: en, zh]
  -h, --help         Print help
```

## `skillport-cli notes set --help`

```text
Usage: skillport-cli.exe notes set [OPTIONS] <REFERENCE>

Arguments:
  <REFERENCE>  

Options:
      --json             
      --text <TEXT>      
      --file <FILE>      
      --lang <LANG>      [default: en] [possible values: en, zh]
      --author <AUTHOR>  
      --dry-run          
      --yes              
  -h, --help             Print help
```

