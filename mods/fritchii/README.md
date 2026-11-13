# Zelda Notes para Fritchii

## Instalar Zelda Notes 0.5.3

1. Cerrá tu Fritchii 5.8.4 habitual. Dentro de `%APPDATA%\fritchii\load\0400486024DEC000`, mové las carpetas anteriores `Zelda Notes Probe` y `Zelda Notes`, si existen, fuera de `load`. Si configuraste otra carpeta de mods, usá esa.
2. Abrí `build/zelda-notes-fritchii-1.1.1.zip` y copiá su carpeta `0400486024DEC000` completa a `load` en el mismo perfil. Esa carpeta incluye `exefs` y `romfs`. Las licencias y créditos pueden quedarse fuera de `load`. Dejá desactivados sloperinaGZ y otros mods que incluyan KaeGae Core para esta prueba.
3. Abrí Fritchii y arrancá el remake 1.1.1 (`v131072`).

Para retirarlo, cerrá Fritchii, mové `load/0400486024DEC000/Zelda Notes` fuera de `load` y volvé a abrir el emulador.

## Controles

- `L + R3` abre o cierra el panel. `L/R` cambia de columna y `ZL/ZR` cambia de zona.
- `X` cambia el filtro de progreso. `Y` alterna Niño y Adulto en exteriores, o pasa al siguiente plano en mazmorras cuando hay varias opciones. El mapa distingue las variantes de un mismo piso con números como `1F (1/2)`.
- En Categorías, movete con la cruceta y presioná `A` para aplicar el filtro Focus.
- En Mapa, el stick derecho desplaza la vista y `Arriba/Abajo` cambia el zoom. `Izquierda/Derecha` cambia de objetivo y `A` lo centra en el mapa.
- En Objetivos, `Arriba/Abajo` cambia de objetivo, `Izquierda/Derecha` desplaza la guía y `A` centra el objetivo en el mapa.
- `B` limpia el filtro Focus si está activo. Si ya está limpio, cierra el panel.

El panel incluye 632 marcadores y 66 fondos. Los objetivos cuyo progreso todavía no se puede leer aparecen como «Sin datos».

El panel usa texto más grande en resoluciones altas y dibuja las categorías y los objetivos con la misma escala de iconos. En 0.5.2, los fondos de Hyrule para ambas edades tienen 1264 × 821 píxeles y caben en los mismos búferes de 4 MiB que usaba la 0.5.0.

## Una sola ronda de prueba

1. Abrí el panel con `L + R3` y buscá Valle Gerudo con `ZL/ZR`. Comprobá en ventana y pantalla completa que se lean los nombres y que se vean enteros los iconos de las categorías y los objetivos.
2. Pasá a la columna Mapa con `R`. Acercá con `Arriba` y desplazá la vista con el stick derecho. Comprobá que los marcadores sigan alineados con el terreno.
3. Navegá a una mazmorra y cambiá de plano con `Y`. Seleccioná un objetivo, leé su guía y cerrá el panel con `L + R3`.
4. Si aparece «Mapa no disponible», anotá la zona y el plano. El registro de Fritchii puede mostrar `Fondo del plano`, `Copia del plano` o `map texture: unsupported present format`.

El paquete de diagnóstico queda disponible como `build/zelda-notes-fritchii-probe.zip` para comprobar únicamente el dibujo.

La verificación local de 0.4.0 pasó con 9 pruebas Python, 28 pruebas Node y 8 pruebas C. La vista simulada usa el catálogo, los fondos y la fuente de dibujo del mod. Queda pendiente la ronda de juego de 0.4.0 en Fritchii.

## Evidencia del adaptador

- En `main` 1.1.1, las referencias a `CollectSign` llevan a la rutina de mapa que busca el `InstanceID` en una tabla ordenada. Lee cantidad en `GameDataMgr+0xc58`, tabla en `+0xc60`, registro de 16 bytes y marca en `+0xc`. El contador usa el ID directo, como el recuento del mapa, y conserva la búsqueda por ID aunque existan registros derivados.
- La rutina en `main+0xba6200` usa el campo `0xc458f1eb` como arreglo de cuatro nombres de escena. Los guardados locales distinguen, por ejemplo, `TimeTemple` en ese arreglo mientras `Sequence_CurrentBanc` contiene `Market_Child`. El catálogo exporta los alias de escena existentes del proyecto. Un nombre sin alias deja el HUD oculto.
- El campo `Sequence_IsChildhood` (`0xcea220d3`) se lee de la tabla de booleanos de GameData. El lector verifica los punteros y vuelve a comprobar escena, edad y tabla después de leer el progreso.

## Resultado en Fritchii de la versión 0.2.0

El usuario confirmó que el HUD permanece oculto hasta entrar en partida, que se ocultó al entrar al rancho de Ingo y que el contador detectó una ficha nueva. Su captura muestra el mapa abierto en la Pradera de Hyrule con el filtro de Skulltulas doradas y un marcador seleccionado. También confirmó que `A` abre la ficha y que `B` vuelve a la lista y devuelve el control de Link al cerrar el mapa.

La verificación local de 0.3.0 pasó: 9 pruebas Python, 27 pruebas Node, los cinco binarios C host (`game_state`, `map_panel`, `counter`, `map_texture`, `map_gpu`) y el ZIP con 66 fondos, manifiesto y atribución. Se verificaron fuera del juego la composición de Hyrule adulto y del Templo del Fuego, el recorte, la orientación y el orden de las copias.

La primera ronda en Fritchii congeló el juego al abrir el mapa con `2002-6905` (`0x35f202`, `nn::fs::ResultNotMounted`) dentro de `nn::fs::OpenFile`. La corrección movió la carga de planos al hilo del juego, reutilizó una textura NVN y cambió la ruta de RomFS a `content:/`, el punto de montaje del juego. El usuario confirmó que el mapa corregido de 0.3.0 funciona en Fritchii.

## Volver a compilar

Se necesita Node, Python 3.11+ con Pillow, LLVM 15+, el `main` NSO descomprimido con Build ID `E0F3CCFAF50065AE4EA01EB5AEB13B1A45DA3348` y la caché `data/tiles`. En la revisión de Hookshot que se usó localmente, la opción para extraer la actualización fue `--title 131072 --only exefs`. [Guía de extracción y descompresión](https://github.com/Kabosune/oot-remake-modding/blob/35223b7160c691192fbea2aaa41cd8f261a6c191/docs/getting-started.md)

Desde la carpeta `zelda-notes`, con LLVM y el checkout fijado disponibles:

```powershell
python mods/fritchii/build.py --main mods/fritchii/build/game/exefs/main --kaepora mods/fritchii/build/kaepora
```

Agregá `--probe` para recompilar la variante de contador fijo. La herramienta upstream invoca `ld.lld` sin extensión. Si Python en Windows no lo encuentra pero `ld.lld.exe` está disponible, agregá a la carpeta local de LLVM una copia de `ld.lld.exe` llamada `ld.lld` y usá ese directorio en `PATH`. El ZIP incluye los avisos de licencia de KaeGae y de la fuente que usa para dibujar.
