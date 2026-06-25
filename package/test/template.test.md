# template

## basic interpolation

```file:template.hbs
Hello {{name}}
```

### should render a single variable

```execute
aux4 template --file template.hbs --name David < /dev/null
```

```expect
Hello David
```

## multiple variables

```file:greeting.hbs
{{greeting}}, {{name}}! You are {{role}}.
```

### should render every provided variable

```execute
aux4 template --file greeting.hbs --greeting Welcome --name Ada --role admin < /dev/null
```

```expect
Welcome, Ada! You are admin.
```

## arrays with each

```file:list.hbs
Shopping list:
{{#each items}}
- {{this}}
{{/each}}
```

### should iterate over a JSON array value

```execute
aux4 template --file list.hbs --items '["apples","bananas","cherries"]' < /dev/null
```

```expect
Shopping list:
- apples
- bananas
- cherries
```

## objects with dot notation

```file:card.hbs
{{user.name}} ({{user.role}})
```

### should access nested fields of a JSON object value

```execute
aux4 template --file card.hbs --user '{"name":"Ada","role":"admin"}' < /dev/null
```

```expect
Ada (admin)
```

## conditionals

```file:cond.hbs
{{#if admin}}Access granted{{else}}Access denied{{/if}}
```

### should render the truthy branch

```execute
aux4 template --file cond.hbs --admin true < /dev/null
```

```expect
Access granted
```

## no html escaping

```file:raw.hbs
{{expr}}
```

### should pass special characters through verbatim

```execute
aux4 template --file raw.hbs --expr 'a < b && c > d' < /dev/null
```

```expect
a < b && c > d
```

## type helpers

```file:bool.hbs
{{#if (bool flag)}}on{{else}}off{{/if}}
```

```file:num.hbs
{{int n}} {{number n}}
```

```file:obj.hbs
{{json user}}
```

```file:when.hbs
{{date d "YYYY-MM-DD"}} @ {{timestamp d}}
```

### bool should treat explicit false-ish values as false

```execute
aux4 template --file bool.hbs --flag false < /dev/null
```

```expect
off
```

### bool should treat other values as true

```execute
aux4 template --file bool.hbs --flag anything < /dev/null
```

```expect
on
```

### int and number should parse numeric strings

```execute
aux4 template --file num.hbs --n 007.50 < /dev/null
```

```expect
7 7.5
```

### json should stringify a value

```execute
aux4 template --file obj.hbs --user '{"a":1,"b":[2,3]}' < /dev/null
```

```expect:json
{
  "a": 1,
  "b": [
    2,
    3
  ]
}
```

### date and timestamp should convert a date value (UTC)

```execute
aux4 template --file when.hbs --d 2000-01-01T00:00:00Z < /dev/null
```

```expect
2000-01-01 @ 946684800
```

## data file as base context

```file:person.hbs
{{name}} {{age}}
```

```file:person.json
{
  "name": "David",
  "age": 30
}
```

### should render from the --data base context

```execute
aux4 template --file person.hbs --data person.json < /dev/null
```

```expect
David 30
```

### should let a --param flag override a field from --data

```execute
aux4 template --file person.hbs --data person.json --age 40 < /dev/null
```

```expect
David 40
```

## streaming json records on stdin

```file:row.hbs
{{name}} is {{age}}
```

### should render the template once per NDJSON record

```execute
printf '{"name":"Ada","age":36}\n{"name":"Linus","age":54}\n' | aux4 template --file row.hbs
```

```expect
Ada is 36
Linus is 54
```

### should apply a --param flag to every record in the stream

```execute
printf '{"name":"Ada","age":36}\n{"name":"Linus","age":54}\n' | aux4 template --file row.hbs --age 99
```

```expect
Ada is 99
Linus is 99
```

### should iterate over a top-level JSON array

```execute
printf '[{"name":"X","age":1},{"name":"Y","age":2}]' | aux4 template --file row.hbs
```

```expect
X is 1
Y is 2
```

### should fail fast on an invalid record

```execute
printf 'not json\n' | aux4 template --file row.hbs
```

```error:partial
Invalid JSON in stream input
```

## writing to an output file

```file:row.hbs
{{name}} is {{age}}
```

```afterAll
rm -f out.txt
```

### should write all stream records to the output file instead of stdout

```execute
printf '{"name":"Ada","age":36}\n{"name":"Linus","age":54}\n' | aux4 template --file row.hbs --output out.txt && cat out.txt
```

```expect
Ada is 36
Linus is 54
```

## aux4 helper

```file:inner.hbs
Hi {{name}}!
```

```file:outer.hbs
Greeting: {{aux4 "template" "--file" "inner.hbs" "--name" "World"}}
```

### should inline the output of another aux4 command

```execute
aux4 template --file outer.hbs < /dev/null
```

```expect
Greeting: Hi World!
```

## missing template file

### should report a clear error

```execute
aux4 template --file nonexistent.hbs < /dev/null
```

```error:partial
Template file not found: nonexistent.hbs
```
