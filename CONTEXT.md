# Quiniela 2026

App de quinielas futboleras entre conocidos: el creador arma una quiniela sobre un torneo real, comparte links por WhatsApp y los datos de partidos llegan solos desde football-data.org. Sin cuentas: la identidad es el link.

## Language

### Juego

**Quiniela**:
Una instancia de juego creada por un Admin sobre un Torneo, con su propio premio, participantes y modo de juego.
_Avoid_: pool, porra, liga (eso es otra cosa)

**Torneo**:
Una competición real de football-data.org (Mundial, Champions, Premier League…) con sus equipos y partidos. Cada Torneo declara su formato, que determina qué modos de juego admite.
_Avoid_: competición, liga (como genérico), mundial (como genérico)

**Formato eliminatorio**:
Formato de Torneo donde los equipos quedan eliminados hasta coronar un campeón (Mundial, Euro, Champions). Único formato que admite el modo Clásica.

**Formato liga**:
Formato de Torneo donde todos juegan contra todos y nadie es eliminado (Premier League, La Liga). Solo admite el modo Progol.

**Clásica**:
Modo de juego donde cada Participante posee equipos repartidos; los equipos mueren al ser eliminados y gana quien posee al campeón. Solo existe en Torneos de formato eliminatorio.
_Avoid_: modo normal, modo equipos

**Progol**:
Modo de juego de pronósticos 1/X/2 por partido; un punto por acierto, gana el líder al cierre del Torneo. Disponible en cualquier formato.
_Avoid_: pronósticos (como nombre del modo), quiniela mexicana

**Ronda**:
Agrupador de partidos de un Torneo: la etapa en formato eliminatorio (grupos, octavos…) o la jornada en formato liga. Los pronósticos de Progol se navegan por Ronda.
_Avoid_: etapa y jornada como términos sueltos en código

**Vista Torneo**:
La vista pública del torneo real dentro de una Quiniela: grupos y bracket en eliminatorios, tabla de posiciones en ligas. El tab muestra el nombre corto del Torneo.
_Avoid_: Mundial (como nombre de la vista)

### Personas y acceso

**Admin**:
Quien crea la Quiniela y posee el link de administración: cierra inscripción, reparte, corrige marcadores, registra pagos.
_Avoid_: creador, dueño, organizador

**Participante**:
Persona inscrita en una Quiniela con nombre y foto; su identidad es su token personal.
_Avoid_: jugador, usuario, miembro

**Link personal**:
URL con token opaco que identifica a un Participante; quien tiene el link es esa persona. No hay cuentas ni contraseñas.
_Avoid_: sesión, login

### Resultados

**Override**:
Corrección manual de un marcador hecha por el Admin que aplica solo a su Quiniela; los datos globales del Torneo quedan intactos.
_Avoid_: corrección global, edición de partido
