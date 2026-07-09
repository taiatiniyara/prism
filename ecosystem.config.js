module.exports = {
  apps: [
    {
      name: "tamcfj", // Must match the name used in your GitHub Actions script
      script: "node_modules/next/dist/bin/next",
      args: "start", // Tells Next.js to start the production server
      instances: "max", // Launches an instance for every CPU core (clustering)
      exec_mode: "cluster", // Enables cluster mode for zero-downtime reloads
      watch: false, // Do not watch files for changes in production
      max_memory_restart: "1G", // Restarts the app if it exceeds 1GB of RAM
      env_production: {
        NODE_ENV: "production",
        PORT: 4210, // Change this if you want your app to run on a different port
      },
    },
  ],
};
