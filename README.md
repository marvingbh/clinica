# Clinica - Sistema de Gestao de Clinicas

Sistema multi-tenant para gestao de clinicas com agendamento, notificacoes e auditoria.

## Pre-requisitos

- Node.js 18+
- Docker e Docker Compose (para o banco de dados)

## Configuracao do Ambiente

### 1. Copiar variaveis de ambiente

```bash
cp .env.example .env.local
```

Edite o arquivo `.env.local` e configure:

```env
# Database Configuration
POSTGRES_USER=clinica
POSTGRES_PASSWORD=clinica_dev
POSTGRES_DB=clinica_dev
POSTGRES_PORT=5432
POSTGRES_HOST=localhost

# Database URL for application
DATABASE_URL=postgresql://clinica:clinica_dev@localhost:5432/clinica_dev

# Next.js Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000

# NextAuth.js Configuration (gere com: npx auth secret)
AUTH_SECRET=sua-chave-secreta-aqui
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Iniciar o banco de dados

```bash
docker-compose up -d
```

Aguarde o container iniciar. Verifique com:

```bash
docker-compose ps
```

### 4. Executar migrations do Prisma

```bash
npm run prisma:migrate
```

Ou para sincronizar o schema sem criar migrations:

```bash
npm run prisma:push
```

### 5. Criar usuario admin de teste

```bash
npm run prisma:seed
```

Isso cria:
- Uma clinica demo
- Um usuario admin

**Credenciais de acesso:**
- Email: `admin@clinicademo.com`
- Senha: `admin`

### 6. Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000)

## Scripts Disponiveis

| Script | Descricao |
|--------|-----------|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Cria build de producao |
| `npm run start` | Inicia servidor de producao |
| `npm run lint` | Executa o linter |
| `npm run prisma:generate` | Gera o Prisma Client |
| `npm run prisma:migrate` | Executa migrations |
| `npm run prisma:push` | Sincroniza schema com o banco |
| `npm run prisma:studio` | Abre o Prisma Studio |
| `npm run prisma:seed` | Popula banco com dados iniciais |

## Estrutura do Projeto

```
src/
├── app/                 # App Router (Next.js 14+)
│   ├── api/            # API Routes
│   └── (pages)/        # Paginas da aplicacao
├── components/         # Componentes React
├── lib/                # Utilitarios e configuracoes
├── generated/          # Prisma Client gerado
└── prisma/             # Schema e migrations
```

## Comandos Uteis

### Visualizar dados no banco

```bash
npm run prisma:studio
```

### Resetar banco de dados

```bash
docker-compose down -v
docker-compose up -d
npm run prisma:push
npm run prisma:seed
```

### Ver logs do container

```bash
docker-compose logs -f db
```
