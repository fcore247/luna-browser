package main

import "browser-mac/internal/opennava"

func (a *App) OpenNavaDevices() ([]opennava.Device, error) { return a.openNava.Devices(a.ctx) }
func (a *App) OpenNavaPair(serial string) error            { return a.openNava.Pair(a.ctx, serial) }
func (a *App) OpenNavaStatus() (opennava.Status, error)    { return a.openNava.Status() }
func (a *App) OpenNavaSave(url, title string) error        { return a.openNava.Add(url, title) }
func (a *App) OpenNavaRemove(url string) error             { return a.openNava.Remove(url) }
func (a *App) OpenNavaForget() error                       { return a.openNava.Forget() }
func (a *App) OpenNavaRetry()                              { a.openNava.Retry() }

func (a *App) OpenNavaConnect(address string) error { return a.openNava.Connect(a.ctx, address) }
