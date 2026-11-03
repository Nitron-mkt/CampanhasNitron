# Plantão da Nina (Teak) — log operacional

A rotina em si está em `ROTINA.md`, nesta mesma pasta. Este arquivo é sobre o
log que a rotina cita.

`respondidos.txt` é o registro de cada rodada do plantão de atendimento da
Teak Brazil: quem escreveu, o que foi respondido, **por que** uma conversa foi
ou não foi atendida, e as lições que não podem se perder.

## Por que este arquivo mora aqui

Até 03/11/2026 ele vivia só na pasta temporária do container onde a sessão
roda. Às 12h10 daquele dia o container foi reciclado no meio do expediente e o
arquivo foi junto: **10.948 linhas, de 05/10 a 03/11**, mais o `ACHADOS.md` com
as cinco peças da Nina da Teak. Não havia cópia.

O gestor autorizou, no mesmo dia, passar a guardar o log no repositório. Git
sobrevive à reciclagem do container; a pasta temporária não.

## Como manter

- O arquivo de trabalho continua em
  `<scratchpad>/teak/respondidos.txt` — é lá que cada rodada escreve, porque é
  rápido e não exige commit a cada hora.
- **No fechamento do dia (19h07 SP)** o arquivo é copiado para cá e commitado.
  Se o dia terminar sem commit, o que foi escrito depois do último commit
  corre o risco de se perder de novo.
- O histórico anterior a 03/11/2026 12h10 **não existe mais**. O arquivo
  recomeça daquele ponto, com um cabeçalho explicando a perda.

## O que não depende deste arquivo

As mensagens trocadas com clientes estão no GHL. As regras do plantão, os
quatro destinos de relatório e a lista de pendências chegam na rotina a cada
rodada. Este arquivo guarda o raciocínio, não a operação.
