#### Description

The `template` command renders a [Handlebars](https://handlebarsjs.com/) template file and writes the result to standard output. Every `--key value` flag you pass on the command line becomes a variable in the template context, so a single template can be reused with different inputs.

Output is treated as plain text rather than HTML, so characters such as `&`, `<`, and `>` are emitted verbatim instead of being escaped into HTML entities.

Values that are passed as JSON arrays or objects are parsed automatically, which makes them usable with Handlebars block helpers such as `{{#each}}` and with dot notation (for example `{{user.name}}`). Plain scalar values (names, numbers written as text) are left as-is. The standard Handlebars helpers `{{#if}}`, `{{#unless}}`, `{{#each}}`, and `{{#with}}` are all available.

A built-in `aux4` helper allows a template to invoke another aux4 command and inline its output: `{{aux4 "command" "arg" ...}}` runs `aux4 command arg ...` and inserts its standard output (trailing newlines trimmed). Because templates execute the commands they reference, only render templates you trust.

Type helpers are provided to interpret string flag values: `bool` (interpret as boolean — only `false`, `0`, `no`, `off`, or empty are false), `int`, `number`, `json` (stringify, with optional `indent=`), `date` (format a date value; ISO by default or with `YYYY-MM-DD HH:mm:ss` tokens, UTC), and `timestamp` (Unix epoch seconds for a date value). Since a flag is a string, `{{#if flag}}` is true even for `--flag false`; use `{{#if (bool flag)}}` for boolean flags. The `date`/`timestamp` helpers convert a supplied value rather than reading the current time, keeping renders reproducible.

The context can be supplied from three sources, applied lowest to highest precedence: a `--data` JSON file (base/defaults), a JSON record read from standard input, and `--key value` flags (explicit overrides applied to every render). A flag therefore always wins over the same field from `--data` or a stream record.

When JSON is piped on standard input, the template is rendered once per record. Newline-delimited JSON (one object per line) and a single top-level JSON array are both accepted, and an invalid record stops processing with a non-zero exit code. With `--output`, the rendered result is written to a file (overwriting it) instead of standard output.

#### Usage

```bash
aux4 template --file <path> [--data <file>] [--output <file>] [--key value ...]
```

--file    Path to the Handlebars template file to render (required).
--data    A JSON file (single object) used as the base template context.
--output  Write the rendered result to this file instead of standard output.
--key     Any additional flag becomes a template variable. JSON arrays and objects are parsed automatically.

#### Example

Template `template.hbs`:

```handlebars
Hello {{name}}
```

```bash
aux4 template --file template.hbs --name David
```

```text
Hello David
```

Overriding a field from a data file (`person.json` is `{"name":"David","age":30}`):

```bash
aux4 template --file person.hbs --data person.json --age 40
```

```text
David 40
```

Rendering one result per record from a JSON stream:

```bash
printf '{"name":"Ada","age":36}\n{"name":"Linus","age":54}\n' | aux4 template --file row.hbs
```

```text
Ada is 36
Linus is 54
```
