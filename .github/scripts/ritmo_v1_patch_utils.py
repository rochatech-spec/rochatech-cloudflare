def js_function_bounds(source,name):
    starts=[source.find(f'function {name}('),source.find(f'async function {name}(')]
    starts=[x for x in starts if x>=0]
    if not starts:
        raise SystemExit(f'Função não encontrada: {name}')
    start=min(starts)
    brace=source.find('{',start)
    if brace<0:
        raise SystemExit(f'Corpo da função não encontrado: {name}')

    depth=0
    i=brace
    state='code'
    escape=False
    template_expr=[]
    n=len(source)
    while i<n:
        ch=source[i]
        nxt=source[i+1] if i+1<n else ''

        if state in ('single','double'):
            if escape:
                escape=False
            elif ch=='\\':
                escape=True
            elif (state=='single' and ch=="'") or (state=='double' and ch=='"'):
                state='code'
        elif state=='template':
            if escape:
                escape=False
            elif ch=='\\':
                escape=True
            elif ch=='`':
                state='code'
            elif ch=='$' and nxt=='{':
                template_expr.append(depth)
                depth+=1
                state='code'
                i+=1
        elif state=='line_comment':
            if ch=='\n':
                state='code'
        elif state=='block_comment':
            if ch=='*' and nxt=='/':
                state='code'
                i+=1
        else:
            if ch=="'":
                state='single'
            elif ch=='"':
                state='double'
            elif ch=='`':
                state='template'
            elif ch=='/' and nxt=='/':
                state='line_comment'; i+=1
            elif ch=='/' and nxt=='*':
                state='block_comment'; i+=1
            elif ch=='{':
                depth+=1
            elif ch=='}':
                depth-=1
                if template_expr and depth==template_expr[-1]:
                    template_expr.pop()
                    state='template'
                elif depth==0:
                    end=i+1
                    while end<n and source[end] in ' \t\r':
                        end+=1
                    if end<n and source[end]==';':
                        end+=1
                    return start,end
        i+=1

    raise SystemExit(f'Fim da função não encontrado: {name}')
