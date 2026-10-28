# II — ONE

Web en inglés de arte digital, fotografía realista, editoriales de moda y videos cortos hechos con IA.

La web es estática: HTML, CSS y JavaScript, sin nada que instalar. Funciona con tres servicios.

- **GitHub** (`matiaspallone-art/ll-one-studio`) guarda el código y su historial de cambios.
- **Vercel** publica la web. Cada vez que se sube un cambio a GitHub, Vercel la actualiza solo en uno o dos minutos.
- **Supabase** (proyecto `ll-one-studio`) guarda la lista de obras y los mensajes del formulario de contacto.

## Qué hace cada archivo

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La estructura de la página: secciones, títulos y textos fijos. |
| `styles.css` | El diseño: colores, tipografías y espacios. |
| `app.js` | Carga las obras desde Supabase, abre las imágenes en grande, envía el formulario y anima el cromo líquido. |
| `config.js` | La dirección y la clave pública de Supabase. |
| `works.js` | Copia de respaldo de las obras, por si Supabase no responde. |
| `assets/art/` | Imágenes y videos de la serie Liquid Chrome en versión web. |

## Agregar una obra nueva (sin tocar código)

1. Entrá a [supabase.com/dashboard](https://supabase.com/dashboard) y abrí el proyecto **ll-one-studio**.
2. **Subir la imagen:** menú izquierdo **Storage**, carpeta `artworks`, botón **Upload file**. Conviene un JPG de unos 2400 px en el lado largo para la web. Guardá el original en alta resolución aparte.
3. Hacé clic en el archivo subido y tocá **Get URL**. Copiá esa dirección.
4. **Crear la ficha:** menú **Table Editor**, tabla `works`, botón **Insert row**. Completá:
   - `chapter`: `digital-art`, `photography`, `editorial` o `films`
   - `title`: el nombre de la obra
   - `series` y `year`: la serie y el año (opcional)
   - `meta`: el pie tipo claqueta, por ejemplo `4:5 · 4000×5000` o `85mm look`
   - `image_url`: la dirección que copiaste
   - `video_url`: solo para videos; subí el .mp4 a Storage y pegá su dirección
   - `aspect`: la proporción con barra, por ejemplo `4/5`, `16/9`, `2/3` o `1/1`
   - `sort`: el orden dentro del capítulo (10, 20, 30…). El número más bajo aparece primero.
5. Guardá. La obra aparece en la web al recargarla, sin publicar nada.

Para ocultar una obra sin borrarla, poné `published` en `false`.

## Leer los mensajes de contacto

En Supabase, **Table Editor**, tabla `inquiries`. Cada fila es un mensaje con nombre, email, tipo de proyecto y texto.

## Probar la web en tu Mac

Abrí la app **Terminal** (Cmd + Espacio, escribí "Terminal" y Enter) y escribí, línea por línea:

    cd ~/Desktop
    git clone https://github.com/matiaspallone-art/ll-one-studio.git
    cd ll-one-studio
    python3 -m http.server 8000

Después abrí http://localhost:8000 en el navegador. Para apagar el servidor, volvé a la Terminal y apretá Control + C.

- `cd` significa "entrar a esta carpeta".
- `git clone` descarga una copia del proyecto desde GitHub.
- `python3 -m http.server` crea un servidor web pequeño en tu Mac, solo visible para vos.

## Publicar un cambio hecho en tu Mac

    git add .
    git commit -m "Describí el cambio"
    git push

- `git add .` prepara todos los archivos que cambiaste.
- `git commit -m` guarda una "foto" del cambio con una descripción.
- `git push` lo sube a GitHub, y Vercel publica la web nueva automáticamente.
