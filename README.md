
# Foco Estudos

Aplicação web para organizar a agenda semanal de estudos, 
cronometrar sessões e acompanhar quanto tempo foi dedicado a cada matéria. 
Cada pessoa tem sua própria conta, e os dados ficam salvos na nuvem, acessíveis de qualquer aparelho.


## Funcionalidades

- **Contas de usuário:** cadastro com e-mail e senha ou login com Google, recuperação de senha por e-mail e exclusão da própria conta.
- **Agenda da semana:** blocos de estudo com matéria, dia, horário e duração, que podem ser editados, removidos e marcados como feitos.
- **Cronômetro:** modo de blocos de foco com pausa (estilo Pomodoro) ou cronômetro livre, com alarme sonoro, vibração no celular e notificação no navegador.
- **Histórico:** tempo estudado hoje e na semana, gráfico de horas por matéria e últimas sessões.
- **Funciona com internet instável:** sessões concluídas sem conexão ficam guardadas no aparelho e são enviadas quando a conexão volta.
- **Responsivo e com modo escuro** automático, conforme a configuração do sistema.

## Tecnologias

| Parte | Tecnologia |
|---|---|
| Interface | HTML5, CSS3 (Grid, Flexbox, variáveis CSS) e JavaScript puro |
| Banco de dados | PostgreSQL no [Supabase](https://supabase.com) |
| Login | Supabase Auth (e-mail/senha e Google OAuth) |
| Hospedagem | GitHub Pages |

## Segurança dos dados

O site conversa direto com o banco usando a chave pública do Supabase. Quem impede um usuário de ver os dados de outro é o **Row Level Security (RLS)** do PostgreSQL: cada tabela tem uma regra que só libera as linhas em que `user_id` é igual ao usuário logado (`auth.uid()`). Mesmo que alguém altere o JavaScript no navegador, o banco recusa o acesso.

A exclusão de conta usa uma função `security definer` que apaga apenas o usuário logado; as tabelas têm `on delete cascade`, então todo o histórico é apagado junto.

## Estrutura

```
index.html        estrutura das telas (login, nova senha e app)
style.css         visual, tema claro/escuro e responsividade
app.js            lógica: login, cronômetro, agenda e acesso ao banco
privacidade.html  política de privacidade (LGPD)
supabase.sql      tabelas, regras de segurança e função de exclusão de conta
```

## Como rodar sua própria cópia

1. Crie um projeto gratuito no [Supabase](https://supabase.com).
2. No **SQL Editor**, rode o conteúdo de `supabase.sql`.
3. Em `app.js`, troque `SUPABASE_URL` e `SUPABASE_ANON_KEY` pelos dados do seu projeto (botão **Connect**, aba **Framework**).
4. Em **Authentication → URL Configuration**, coloque o endereço onde o site vai ficar em **Site URL** e **Redirect URLs**.
5. Publique os arquivos no GitHub Pages (ou abra o `index.html` com um servidor local, como a extensão Live Server do VS Code).

## Próximos passos

- Painel de progresso com metas semanais e sequência de dias estudados
- Instalação como app no celular (PWA)
- Grupos de estudo com ranking semanal

# tempo-estudos
