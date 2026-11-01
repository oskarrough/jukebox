// The page around the app: the head, and a body for App to render into.
export default function Document(props) {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>Jukebox</title>
				<link
					rel="icon"
					href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%23ff5a1f'/><circle cx='16' cy='16' r='7' fill='%23111'/></svg>"
				/>
			</head>
			<body>{props.children}</body>
		</html>
	)
}
